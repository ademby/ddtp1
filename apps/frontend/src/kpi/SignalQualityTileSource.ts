import ImageTileSource from "ol/source/ImageTile.js";
import { createXYZ } from "ol/tilegrid.js";
import {
  SIGNAL_QUALITY_GRID_SIZE,
  signalQualityTilePath,
} from "@drone-drive/contracts/signal-quality";
import {
  paletteToWorkerStops,
  type SignalQualityPalette,
} from "./SignalQualityPalette.js";

const TILE_SIZE = 256;
const GRID_SIZE = SIGNAL_QUALITY_GRID_SIZE;
const TILE_GRID = createXYZ({ tileSize: TILE_SIZE, maxZoom: 19 });

interface TileResult {
  type: "tile";
  id: number;
  bitmap: ImageBitmap;
}

/**
 * Fetches pre-interpolated numeric grid tiles from the backend and colorizes them client-side
 * (via the same worker used offline, on a "grid-tile" message that skips interpolation).
 * The backend computes values; this class only ever decides how to paint them, so palette
 * changes are a `setRange` call away, no refetch.
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

  constructor(private readonly apiBaseUrl: string) {
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
    const path = signalQualityTilePath({ z, x, y });
    const response = await fetch(
      `${this.apiBaseUrl}${path}?v=${encodeURIComponent(this.version)}`,
    );
    if (!response.ok)
      throw new Error(`Failed to load Signal Quality tile: ${response.status}`);
    const grid = await response.arrayBuffer();

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
