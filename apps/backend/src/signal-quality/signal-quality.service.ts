import { Injectable } from "@nestjs/common";
import { PrismaMissionResultRepository } from "../mission-result/mission-result-repository.js";
import { DomainEvents } from "../common/domain-events.js";
import { SIGNAL_QUALITY_GRID_SIZE } from "@drone-drive/contracts/signal-quality";
import type {
  SignalQualityRange,
  SignalQualityTileCoord,
} from "@drone-drive/contracts/signal-quality";
import { signalQualityConfig } from "./signal-quality.config.js";

const KPI_KEY = "signalQuality";
export const TILE_RESOLUTION = SIGNAL_QUALITY_GRID_SIZE;

const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEGREE = 111320;
const WEB_MERCATOR_ORIGIN = 20037508.342789244;
const BUCKET_SIZE_DEG = 0.01;
const BUCKET_LON_OFFSET = 18000;
const BUCKET_LAT_OFFSET = 9000;
const BUCKET_LAT_STRIDE = 20000;

interface ApprovedPoint {
  readonly longitude: number;
  readonly latitude: number;
  readonly value: number;
}

interface PointsSnapshot {
  readonly points: readonly ApprovedPoint[];
  readonly buckets: ReadonlyMap<number, readonly ApprovedPoint[]>;
  readonly version: string;
  readonly expiresAt: number;
}

@Injectable()
export class SignalQualityService {
  private pointsSnapshot: PointsSnapshot | null = null;
  private readonly tileCache = new Map<string, Float32Array>();

  constructor(
    private readonly results: PrismaMissionResultRepository,
    events: DomainEvents,
  ) {
    // Reacts to the event MissionResultService emits on finalize (ADR-0007) instead of exposing
    // `invalidate()` for that module to call directly — this module only needs to know "the
    // approved set changed", not that mission-result exists.
    events.onResultRevisionFinalized(() => this.invalidate());
  }

  async getRange(): Promise<SignalQualityRange> {
    const { points, version } = await this.currentPoints();
    if (!points.length) return { min: 0, max: 100, version: "empty" };

    let min = Infinity;
    let max = -Infinity;
    for (const point of points) {
      if (point.value < min) min = point.value;
      if (point.value > max) max = point.value;
    }
    return { min, max, version };
  }

  async getTile({ z, x, y }: SignalQualityTileCoord): Promise<Float32Array> {
    const { points, buckets, version } = await this.currentPoints();
    const cacheKey = `${version}:${z}:${x}:${y}`;
    const cached = this.tileCache.get(cacheKey);
    if (cached) return cached;

    const start = performance.now();

    const grid = new Float32Array(TILE_RESOLUTION * TILE_RESOLUTION).fill(NaN);

    if (points.length) {
      const extent = tileExtent3857(z, x, y);
      const radius = radiusForZoom(z);
      const maxNeighbours = z >= 16 ? 24 : 16;

      for (let py = 0; py < TILE_RESOLUTION; py += 1) {
        const pixelY = (py + 0.5) / TILE_RESOLUTION;
        const mapY = extent[3] - pixelY * (extent[3] - extent[1]);
        const lat = webMercatorYToLat(mapY);

        for (let px = 0; px < TILE_RESOLUTION; px += 1) {
          const pixelX = (px + 0.5) / TILE_RESOLUTION;
          const mapX = extent[0] + pixelX * (extent[2] - extent[0]);
          const lon = webMercatorXToLon(mapX);

          const value = idw(lon, lat, radius, maxNeighbours, buckets);

          if (value !== null) {
            grid[py * TILE_RESOLUTION + px] = value;
          }
        }
      }
    }

    this.cacheTile(cacheKey, grid);

    const end = performance.now();
    console.log("generation took :", end - start, "ms");

    return grid;
  }

  invalidate(): void {
    this.pointsSnapshot = null;
    this.tileCache.clear();
  }

  private async currentPoints(): Promise<{
    points: readonly ApprovedPoint[];
    buckets: ReadonlyMap<number, readonly ApprovedPoint[]>;
    version: string;
  }> {
    const now = Date.now();
    if (this.pointsSnapshot && this.pointsSnapshot.expiresAt > now) {
      return this.pointsSnapshot;
    }

    const measurements = await this.results.allApprovedMeasurements();
    const points: ApprovedPoint[] = [];
    const buckets = new Map<number, ApprovedPoint[]>();

    for (const measurement of measurements) {
      const value = measurement.rawObservations[KPI_KEY];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;

      const point: ApprovedPoint = {
        longitude: measurement.longitude,
        latitude: measurement.latitude,
        value,
      };

      points.push(point);

      const bx = Math.floor(point.longitude / BUCKET_SIZE_DEG);
      const by = Math.floor(point.latitude / BUCKET_SIZE_DEG);
      const key = bucketKey(bx, by);
      const bucket = buckets.get(key);

      if (bucket) {
        bucket.push(point);
      } else {
        buckets.set(key, [point]);
      }
    }

    const version = this.version(points);

    if (!this.pointsSnapshot || this.pointsSnapshot.version !== version) {
      this.tileCache.clear();
    }

    this.pointsSnapshot = {
      points,
      buckets,
      version,
      expiresAt: now + signalQualityConfig.pointsTtlMs,
    };

    return this.pointsSnapshot;
  }

  private cacheTile(key: string, grid: Float32Array): void {
    if (this.tileCache.size >= signalQualityConfig.maxCachedTiles) {
      const oldestKey = this.tileCache.keys().next().value;
      if (oldestKey !== undefined) this.tileCache.delete(oldestKey);
    }
    this.tileCache.set(key, grid);
  }

  private version(points: readonly ApprovedPoint[]): string {
    const checksum = points.reduce((total, point) => total + point.value, 0);
    return `${points.length}-${Math.round(checksum * 1000)}`;
  }
}

/**
 * IDW over a spatial bucket index.
 *
 * The old implementation compared every approved measurement against every grid cell.
 * This version:
 * - visits only buckets intersecting the search radius;
 * - uses an equirectangular distance approximation instead of haversine trig;
 * - keeps only the nearest K points, avoiding a full candidate sort.
 *
 * At the geographic scale of these tiles/radii, the planar approximation is sufficient
 * while removing several expensive trig operations from the inner pixel loop.
 */
function idw(
  lon: number,
  lat: number,
  radius: number,
  maxNeighbours: number,
  buckets: ReadonlyMap<number, readonly ApprovedPoint[]>,
): number | null {
  const latRad = lat * DEG_TO_RAD;
  const cosLat = Math.max(Math.cos(latRad), 0.1);

  const latDelta = radius / METERS_PER_DEGREE;
  const lonDelta = radius / (METERS_PER_DEGREE * cosLat);

  const minLonBucket = Math.floor((lon - lonDelta) / BUCKET_SIZE_DEG);
  const maxLonBucket = Math.floor((lon + lonDelta) / BUCKET_SIZE_DEG);
  const minLatBucket = Math.floor((lat - latDelta) / BUCKET_SIZE_DEG);
  const maxLatBucket = Math.floor((lat + latDelta) / BUCKET_SIZE_DEG);

  const nearestPoints = new Array<ApprovedPoint>(maxNeighbours);
  const nearestDistances = new Array<number>(maxNeighbours);
  let nearestCount = 0;
  let farthestDistance = Infinity;
  const radiusSquared = radius * radius;

  for (let bx = minLonBucket; bx <= maxLonBucket; bx += 1) {
    for (let by = minLatBucket; by <= maxLatBucket; by += 1) {
      const bucket = buckets.get(bucketKey(bx, by));
      if (!bucket) continue;

      for (const point of bucket) {
        const dx = (point.longitude - lon) * METERS_PER_DEGREE * cosLat;
        const dy = (point.latitude - lat) * METERS_PER_DEGREE;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared === 0) return point.value;
        if (distanceSquared > radiusSquared) continue;
        if (
          nearestCount === maxNeighbours &&
          distanceSquared >= farthestDistance
        ) {
          continue;
        }

        let insertAt = nearestCount;
        if (nearestCount < maxNeighbours) {
          nearestCount += 1;
        } else {
          insertAt = maxNeighbours - 1;
        }

        while (
          insertAt > 0 &&
          distanceSquared < nearestDistances[insertAt - 1]
        ) {
          nearestDistances[insertAt] = nearestDistances[insertAt - 1];
          nearestPoints[insertAt] = nearestPoints[insertAt - 1];
          insertAt -= 1;
        }

        nearestDistances[insertAt] = distanceSquared;
        nearestPoints[insertAt] = point;

        farthestDistance = nearestDistances[nearestCount - 1];
      }
    }
  }

  if (nearestCount === 0) return null;

  let valueSum = 0;
  let weightSum = 0;

  for (let i = 0; i < nearestCount; i += 1) {
    const point = nearestPoints[i];
    const distanceSquared = nearestDistances[i];
    const weight = 1 / distanceSquared;

    valueSum += point.value * weight;
    weightSum += weight;
  }

  return weightSum === 0 ? null : valueSum / weightSum;
}

function bucketKey(bx: number, by: number): number {
  return (
    (bx + BUCKET_LON_OFFSET) * BUCKET_LAT_STRIDE + (by + BUCKET_LAT_OFFSET)
  );
}

function radiusForZoom(z: number): number {
  const table = signalQualityConfig.radiusByZoom;
  if (table[z] !== undefined) return table[z];
  return z < 5 ? 12_000 : 140;
}

function tileExtent3857(
  z: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const world = WEB_MERCATOR_ORIGIN * 2;
  const resolution = world / 256 / 2 ** z;
  const minX = -WEB_MERCATOR_ORIGIN + x * 256 * resolution;
  const maxX = minX + 256 * resolution;
  const maxY = WEB_MERCATOR_ORIGIN - y * 256 * resolution;
  const minY = maxY - 256 * resolution;
  return [minX, minY, maxX, maxY];
}

function webMercatorXToLon(x: number): number {
  return (x / WEB_MERCATOR_ORIGIN) * 180;
}

function webMercatorYToLat(y: number): number {
  const degrees = (y / WEB_MERCATOR_ORIGIN) * 180;
  return (
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((degrees * Math.PI) / 180)) - Math.PI / 2)
  );
}
