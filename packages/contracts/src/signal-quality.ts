/**
 * Wire contract for the Signal Quality KPI surface (ADR-0004).
 *
 * Only numeric data crosses this boundary. Presentation (palettes, thresholds, opacity)
 * is a client-side concern and deliberately has no representation here.
 */

/** Row-major grid resolution of a single data tile. Backend and frontend must agree on this. */
export const SIGNAL_QUALITY_GRID_SIZE = 64;

export interface SignalQualityTileCoord {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/**
 * The value range and version of the current approved-measurement set.
 * `version` changes whenever the approved set changes and is used to cache-bust tiles.
 */
export interface SignalQualityRange {
  readonly min: number;
  readonly max: number;
  readonly version: string;
}

/**
 * A `SIGNAL_QUALITY_GRID_SIZE x SIGNAL_QUALITY_GRID_SIZE` row-major grid of numeric values,
 * serialized as raw `Float32Array` bytes. `NaN` marks a cell with no nearby data.
 */
export type SignalQualityTile = Float32Array;

export interface SignalQualityApi {
  getRange(): Promise<SignalQualityRange>;
  getTile(coord: SignalQualityTileCoord): Promise<SignalQualityTile>;
}

/** Builds the REST path for a tile, shared so frontend/backend never drift on the URL shape. */
export function signalQualityTilePath(coord: SignalQualityTileCoord): string {
  return `/signal-quality/tiles/${coord.z}/${coord.x}/${coord.y}`;
}
