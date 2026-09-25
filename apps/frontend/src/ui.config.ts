/**
 * Frontend rendering / UI product defaults (build-time source config).
 *
 * Ownership: frontend composition root and KPI rendering path only.
 * Runtime/infrastructure values (API base URL) stay in env (`VITE_*`).
 * Shared protocol values (grid size) live in `@drone-drive/contracts`.
 * Palette defaults live with the presentation module (`SignalQualityPalette`).
 */
export type KpiRendererKind = "canvas" | "webgl";

export const uiConfig = {
  /** Static selection of KPI tile renderer. WebGL is retained but not operator-ready. */
  kpiRenderer: "canvas" as KpiRendererKind,

  /**
   * Planned seam for round-robin Canvas colorization workers.
   * Current path uses a single worker; value is the knob for a future pool.
   */
  workerPoolSize: 1,

  /** Display tile pixel size for Canvas/WebGL tile sources (not the numeric grid). */
  tileSize: 256,

  /** Max zoom for Signal Quality tile grids. */
  maxZoom: 19,
} as const;

export type UiConfig = typeof uiConfig;
