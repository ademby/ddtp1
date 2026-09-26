import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import { SIGNAL_QUALITY_GRID_SIZE } from "@drone-drive/contracts/signal-quality";
import DataTileSource from "ol/source/DataTile.js";
import { createXYZ } from "ol/tilegrid.js";
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
 * Backend numeric tile source for WebGL.
 * Tiles stay numeric into OL/WebGL. Loads only via SignalQualityApi.getTile.
 * Palette changes never touch the network or numeric cache.
 */
export class SignalQualityTileSource_ForWebGL extends DataTileSource {
  private min = 0;
  private max = 100;
  private version = "unversioned";
  private readonly numericCache = new Map<string, NumericTile>();
  private readonly inFlight = new Map<string, Promise<NumericTile>>();

  constructor(private readonly api: SignalQualityApi) {
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

    const promise = this.api
      .getTile({ z, x, y })
      .then((tile) => {
        this.touch(key, tile);
        return tile;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
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
