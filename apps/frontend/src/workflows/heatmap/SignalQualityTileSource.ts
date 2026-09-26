import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import { SIGNAL_QUALITY_GRID_SIZE } from "@drone-drive/contracts/signal-quality";
import ImageTileSource from "ol/source/ImageTile.js";
import { createXYZ } from "ol/tilegrid.js";
import { uiConfig } from "../../ui.config.js";
import {
  paletteToWorkerStops,
  type SignalQualityPalette,
} from "./SignalQualityPalette.js";

const TILE_SIZE = uiConfig.tileSize;
const GRID_SIZE = SIGNAL_QUALITY_GRID_SIZE;
const TILE_GRID = createXYZ({
  tileSize: TILE_SIZE,
  maxZoom: uiConfig.maxZoom,
});

interface TileResult {
  type: "tile";
  id: number;
  bitmap: ImageBitmap;
}

/**
 * Fetches pre-interpolated numeric grid tiles via SignalQualityApi and colorizes them
 * client-side (worker). Never performs raw fetch or knows apiBaseUrl.
 */
export class SignalQualityTileSource extends ImageTileSource {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (image: ImageBitmap) => void;
      reject: (error: Error) => void;
    }
  >();

  private min = 0;
  private max = 100;
  private version = "unversioned";

  constructor(private readonly api: SignalQualityApi) {
    super({
      projection: "EPSG:3857",
      tileGrid: TILE_GRID,
      wrapX: false,
      interpolate: true,
      transition: 150,
      loader: (z, x, y) => this.requestTile(z, x, y),
    });

    this.worker = new Worker(
      new URL("./signal-quality.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (event: MessageEvent<TileResult>) => {
      const result = event.data;
      const pending = this.pending.get(result.id);
      if (!pending) {
        result.bitmap.close();
        return;
      }
      this.pending.delete(result.id);
      pending.resolve(result.bitmap);
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Signal Quality worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  setRange(min: number, max: number, version: string): void {
    this.min = min;
    this.max = max;
    this.version = version;
    this.worker.postMessage({ type: "config", min, max });
    this.changed();
  }

  setPalette(palette: SignalQualityPalette): void {
    this.worker.postMessage({
      type: "palette",
      stops: paletteToWorkerStops(palette),
    });
    this.changed();
  }

  public override getKey(): string {
    return `signal-quality-backend-${this.min}-${this.max}-${this.version}`;
  }

  private async requestTile(
    z: number,
    x: number,
    y: number,
  ): Promise<ImageBitmap> {
    const tile = await this.api.getTile({ z, x, y });
    // Transfer a copy so the source retains ownership of the typed array if needed later.
    const grid = tile.buffer.slice(
      tile.byteOffset,
      tile.byteOffset + tile.byteLength,
    );

    const id = this.nextRequestId++;
    return new Promise<ImageBitmap>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(
        { type: "grid-tile", id, grid, size: GRID_SIZE },
        [grid],
      );
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Signal Quality source disposed"));
    }
    this.pending.clear();
    super.dispose();
  }
}

export default SignalQualityTileSource;
