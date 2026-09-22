import type { SignalQualityDataset } from '../kpi/SignalQuality.js';
import {
  DEFAULT_SIGNAL_QUALITY_PALETTE,
  isValidPalette,
  type SignalQualityPalette,
} from '../kpi/SignalQualityPalette.js';

export interface HeatmapMapWorkspace {
  isVisible(): boolean;
  setVisible(visible: boolean): void;
}

export interface HeatmapDataSource {
  load(): Promise<SignalQualityDataset>;
}

export interface HeatmapRenderer {
  setDataset(dataset: SignalQualityDataset): void;
  setPalette(palette: SignalQualityPalette): void;
}

export interface HeatmapLegend {
  readonly element: HTMLElement;
  setRange(min: number, max: number): void;
  setPalette(palette: SignalQualityPalette): void;
}

export interface HeatmapWorkflowOptions {
  readonly mapWorkspace: HeatmapMapWorkspace;
  readonly dataSource: HeatmapDataSource;
  readonly renderer: HeatmapRenderer;
  readonly legend: HeatmapLegend;
  /** Defaults to `DEFAULT_SIGNAL_QUALITY_PALETTE` when omitted. */
  readonly initialPalette?: SignalQualityPalette;
}

/**
 * Owns the heatmap's application state: visibility, the loaded dataset, and the color palette.
 * The palette is presentation-only (ADR-0004) and lives here rather than in the renderer/legend
 * so there is a single source of truth the UI can read from and push edits through.
 */
export class HeatmapWorkflow {
  private readonly mapWorkspace: HeatmapMapWorkspace;
  private readonly dataSource: HeatmapDataSource;
  private readonly renderer: HeatmapRenderer;
  private readonly legend: HeatmapLegend;
  private dataLoaded = false;
  private palette: SignalQualityPalette;

  constructor(options: HeatmapWorkflowOptions) {
    this.mapWorkspace = options.mapWorkspace;
    this.dataSource = options.dataSource;
    this.renderer = options.renderer;
    this.legend = options.legend;
    this.palette = options.initialPalette ?? DEFAULT_SIGNAL_QUALITY_PALETTE;
    // Apply immediately so the worker/legend are configured even before a dataset loads.
    this.renderer.setPalette(this.palette);
    this.legend.setPalette(this.palette);
  }

  getPalette(): SignalQualityPalette {
    return this.palette;
  }

  /** Updates the color ramp and repaints the live map layer and legend immediately. */
  setPalette(palette: SignalQualityPalette): void {
    if (!isValidPalette(palette)) {
      throw new Error('Signal Quality palette must have at least two stops spanning 0..1 with valid hex colors.');
    }
    this.palette = palette;
    this.renderer.setPalette(palette);
    this.legend.setPalette(palette);
  }

  resetPalette(): void {
    this.setPalette(DEFAULT_SIGNAL_QUALITY_PALETTE);
  }

  async load(): Promise<void> {
    const dataset = await this.dataSource.load();
    this.renderer.setDataset(dataset);
    this.legend.setRange(dataset.min, dataset.max);
    this.dataLoaded = true;
    this.mapWorkspace.setVisible(false);
    this.legend.element.style.display = 'none';
  }

  /**
   * Re-fetches the current range/version and re-applies it to the renderer, without touching
   * visibility. `dataSource.load()` -> `renderer.setDataset()` advances the tile source's
   * version, which changes its OpenLayers cache key (see SignalQualityTileSource.getKey()) so
   * previously-cached tiles are abandoned and every tile is re-requested against fresh data —
   * no manual per-tile invalidation needed. A no-op until the first `load()`/`toggle()`.
   */
  async refresh(): Promise<void> {
    if (!this.dataLoaded) return;
    const dataset = await this.dataSource.load();
    this.renderer.setDataset(dataset);
    this.legend.setRange(dataset.min, dataset.max);
  }

  async toggle(): Promise<void> {
    if (this.mapWorkspace.isVisible()) {
      this.mapWorkspace.setVisible(false);
      this.legend.element.style.display = 'none';
      return;
    }
    if (!this.dataLoaded) await this.load();
    this.mapWorkspace.setVisible(true);
    this.legend.element.style.display = 'block';
  }
}

export default HeatmapWorkflow;
