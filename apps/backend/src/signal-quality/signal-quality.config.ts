/**
 * Signal Quality projection / data parameters (module-owned domain config).
 *
 * Ownership: SignalQualityModule only. Not a global application config object.
 * Shared protocol (grid size) is imported from `@drone-drive/contracts`.
 * Interpolation radii and cache knobs are tunable here without scattering magic numbers.
 */
export const signalQualityConfig = {
  /** How long an approved-points snapshot is reused before reloading from the result store. */
  pointsTtlMs: 5_000,

  /** Soft cap on in-memory numeric tile cache entries (LRU-ish eviction of oldest key). */
  maxCachedTiles: 2_000,

  /**
   * IDW search radius (meters) by Web Mercator zoom.
   * Product default for continuous surface interpolation.
   */
  radiusByZoom: {
    5: 12_000,
    6: 10_000,
    7: 8_000,
    8: 6_000,
    9: 4_500,
    10: 3_000,
    11: 2_200,
    12: 1_500,
    13: 1_000,
    14: 700,
    15: 500,
    16: 350,
    17: 250,
    18: 180,
    19: 140,
  } as Readonly<Record<number, number>>,
} as const;

export type SignalQualityConfig = typeof signalQualityConfig;
