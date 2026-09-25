import { DEFAULT_SIGNAL_QUALITY_PALETTE, paletteToWorkerStops } from "./SignalQualityPalette";
import { uiConfig } from "../ui.config.js";

const TILE_SIZE = uiConfig.tileSize;
const CELL_SIZE_DEG = 0.01;
/** Offline/local IDW radii; production tiles use backend projection config. */
const DEFAULT_RADIUS_BY_ZOOM: Record<number, number> = {
  5: 12000,
  6: 10000,
  7: 8000,
  8: 6000,
  9: 4500,
  10: 3000,
  11: 2200,
  12: 1500,
  13: 1000,
  14: 700,
  15: 500,
  16: 350,
  17: 250,
  18: 180,
  19: 140,
};

let min = 0;
let max = 100;
const LUT_SIZE = 1024;
let paletteLut = new Uint8Array(LUT_SIZE * 4);

// The active color ramp. Seeded with the same defaults as `DEFAULT_SIGNAL_QUALITY_PALETTE`
// (kept as plain tuples here since workers can't import `HeatmapWorkflow`'s module graph);
// `HeatmapWorkflow` pushes replacements via a `"palette"` message so edits repaint live.
let stops: Array<[number, string]> = paletteToWorkerStops(DEFAULT_SIGNAL_QUALITY_PALETTE);
buildPaletteLut();

self.onmessage = async (
  event: MessageEvent<
    | { type: "config"; min: number; max: number }
    | { type: "palette"; stops: Array<[number, string]> }
    | { type: "grid-tile"; id: number; grid: ArrayBuffer; size: number }
  >,
) => {
  const message = event.data;

  if (message.type === "config") {
    min = message.min;
    max = message.max;
    return;
  }

  if (message.type === "palette") {
    if (message.stops.length >= 2) {
      stops = message.stops;
      buildPaletteLut();
    }
    return;
  }
  // The new numeric tile approach
  if (message.type === "grid-tile") {
    const values = new Float32Array(message.grid);
    const bitmap = await renderPrecomputedGrid(values, message.size);
    self.postMessage(
      { type: "tile", id: message.id, bitmap },
      { transfer: [bitmap] },
    );
    return;
  }
};

function createEmptyTile(): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create 2D context");
  }

  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

  return createImageBitmap(canvas);
}

function parseHexRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

// The new numeric tile approach

/**
 * Colorizes a numeric grid that was already interpolated server-side (see
 * `SignalQualityTileSource` in backend mode). No interpolation happens here — only the
 * value -> color/opacity mapping, which is the part ADR-0004 keeps client-side so palettes
 * can change without refetching data.
 */
async function renderPrecomputedGrid(
  grid: Float32Array,
  size: number,
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) return createEmptyTile();

  const image = context.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const value = grid[i];
    const offset = i * 4;
    if (Number.isNaN(value)) {
      image.data[offset + 3] = 0;
      continue;
    }
    const lutIndex = paletteIndex(value, min, max);
    const lutOffset = lutIndex * 4;
    image.data[offset] = paletteLut[lutOffset];
    image.data[offset + 1] = paletteLut[lutOffset + 1];
    image.data[offset + 2] = paletteLut[lutOffset + 2];
    image.data[offset + 3] = 215;
  }

  const small = new OffscreenCanvas(size, size);
  const smallContext = small.getContext("2d")!;
  smallContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(small, 0, 0, TILE_SIZE, TILE_SIZE);
  return createImageBitmap(canvas);
}

function paletteIndex(value: number, minimum: number, maximum: number): number {
  const t = Math.min(
    1,
    Math.max(0, (value - minimum) / (maximum - minimum || 1)),
  );
  return Math.min(LUT_SIZE - 1, Math.round(t * (LUT_SIZE - 1)));
}

function buildPaletteLut(): void {
  paletteLut = new Uint8Array(LUT_SIZE * 4);
  let stopIndex = 1;
  let left = parseHexRgb(stops[0][1]);
  let right = parseHexRgb(stops[1][1]);

  for (let i = 0; i < LUT_SIZE; i += 1) {
    const t = i / (LUT_SIZE - 1);
    while (stopIndex < stops.length - 1 && t > stops[stopIndex][0]) {
      stopIndex += 1;
      left = parseHexRgb(stops[stopIndex - 1][1]);
      right = parseHexRgb(stops[stopIndex][1]);
    }

    const start = stops[stopIndex - 1][0];
    const end = stops[stopIndex][0];
    const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
    const offset = i * 4;
    paletteLut[offset] = Math.round(left[0] + (right[0] - left[0]) * p);
    paletteLut[offset + 1] = Math.round(left[1] + (right[1] - left[1]) * p);
    paletteLut[offset + 2] = Math.round(left[2] + (right[2] - left[2]) * p);
    paletteLut[offset + 3] = 255;
  }
}
