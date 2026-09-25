import DataTileSource from "ol/source/DataTile.js";
import { createXYZ } from "ol/tilegrid.js";
import {
  SIGNAL_QUALITY_GRID_SIZE,
  signalQualityTilePath,
} from "@drone-drive/contracts/signal-quality";
import { uiConfig } from "../ui.config.js";
import type { SignalQualityPalette } from "./SignalQualityPalette.js";

const GRID_SIZE = SIGNAL_QUALITY_GRID_SIZE;
const TILE_GRID = createXYZ({
  tileSize: GRID_SIZE,
  maxZoom: uiConfig.maxZoom,
});
const MAX_NUMERIC_TILES = 512;

type NumericTile = Float32Array;

/**
 * Backend numeric tile source.
 *
 * Tiles stay numeric all the way into OpenLayers/WebGL. The source keeps a bounded browser-side
 * numeric cache, while OpenLayers also keeps its own tile/texture caches. Palette changes therefore
 * never touch the network or numeric tile cache.
 */
export class SignalQualityTileSource_ForWebGL extends DataTileSource {
  private min = 0;
  private max = 100;
  private version = "unversioned";
  private readonly numericCache = new Map<string, NumericTile>();
  private readonly inFlight = new Map<string, Promise<NumericTile>>();

  constructor(private readonly apiBaseUrl: string) {
    super({
      projection: "EPSG:3857",
      tileSize: GRID_SIZE,
      tileGrid: TILE_GRID,
      wrapX: false,
      interpolate: true,
      transition: 0,
      bandCount: 1,
      hasAlpha: false,
      loader: (z, x, y) => this.requestTile(z, x, y),
    });
  }

  setRange(min: number, max: number, version: string): void {
    const versionChanged = this.version !== version;
    const rangeChanged = this.min !== min || this.max !== max;
    this.min = min;
    this.max = max;
    this.version = version;

    if (versionChanged) {
      this.numericCache.clear();
      this.inFlight.clear();
    }

    this.set("key", `signal-quality-backend-${version}`);
    this.changed();
  }

  setPalette(_palette: SignalQualityPalette): void {
    // Palette is a WebGL layer concern. Numeric tiles deliberately remain untouched.
  }

  getRange(): { min: number; max: number } {
    return { min: this.min, max: this.max };
  }

  private requestTile(z: number, x: number, y: number): Promise<NumericTile> {
    const key = `${this.version}:${z}:${x}:${y}`;
    const cached = this.numericCache.get(key);
    if (cached) {
      this.touch(key, cached);
      return Promise.resolve(cached);
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = fetch(
      `${this.apiBaseUrl}${signalQualityTilePath({ z, x, y })}?v=${encodeURIComponent(this.version)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load Signal Quality tile: ${response.status}`,
          );
        }
        const bytes = await response.arrayBuffer();
        const tile = new Float32Array(bytes);
        this.touch(key, tile);
        return tile;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    // console.trace("Debugging the call stack");
    return promise;
  }

  private touch(key: string, tile: NumericTile): void {
    this.numericCache.delete(key);
    this.numericCache.set(key, tile);
    while (this.numericCache.size > MAX_NUMERIC_TILES) {
      const oldest = this.numericCache.keys().next().value;
      if (oldest === undefined) break;
      this.numericCache.delete(oldest);
    }
  }
}

export default SignalQualityTileSource_ForWebGL;
