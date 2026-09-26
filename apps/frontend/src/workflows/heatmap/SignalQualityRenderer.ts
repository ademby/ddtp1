import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import type BaseLayer from "ol/layer/Base.js";
import TileLayer from "ol/layer/Tile.js";
import WebGLTileLayer from "ol/layer/WebGLTile.js";
import { uiConfig } from "../../ui.config.js";
import {
  DEFAULT_SIGNAL_QUALITY_PALETTE,
  type SignalQualityPalette,
} from "./SignalQualityPalette.js";
import { SignalQualityTileSource } from "./SignalQualityTileSource.js";
import SignalQualityTileSource_ForWebGL from "./SignalQualityTileSource_ForWebGL.js";

/**
 * Turns numeric tiles + palette into the map layer.
 * Not network (callers use SignalQualityApi). Not operator state (HeatmapWorkflow).
 * Hides Canvas vs WebGL choice, worker colorization, numeric cache, and OL style wiring.
 */
export interface SignalQualityRenderer {
  readonly layer: BaseLayer;
  setRange(min: number, max: number, version: string): void;
  setPalette(palette: SignalQualityPalette): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

function buildWebGlStyle(
  min: number,
  max: number,
  palette: SignalQualityPalette,
) {
  const value = ["band", 1];
  const normalized = [
    "clamp",
    ["/", ["-", value, min], max - min || 1],
    0,
    1,
  ];
  const color: unknown[] = ["interpolate", ["linear"], normalized];
  for (const stop of palette) {
    color.push(stop.offset, stop.color);
  }
  return { color };
}

export class HttpSignalQualityRenderer implements SignalQualityRenderer {
  readonly layer: BaseLayer;
  private readonly source:
    | SignalQualityTileSource
    | SignalQualityTileSource_ForWebGL;
  private palette: SignalQualityPalette = DEFAULT_SIGNAL_QUALITY_PALETTE;
  private min = 0;
  private max = 100;

  constructor(api: SignalQualityApi) {
    if (uiConfig.kpiRenderer === "canvas") {
      this.source = new SignalQualityTileSource(api);
      this.layer = new TileLayer({
        source: this.source,
        zIndex: 45,
        opacity: 0.78,
        visible: false,
        cacheSize: 1024,
      });
    } else {
      this.source = new SignalQualityTileSource_ForWebGL(api);
      this.layer = new WebGLTileLayer({
        source: this.source,
        zIndex: 45,
        opacity: 0.78,
        visible: false,
        cacheSize: 1024,
        style: buildWebGlStyle(this.min, this.max, this.palette),
      });
    }
  }

  setRange(min: number, max: number, version: string): void {
    this.min = min;
    this.max = max;
    this.source.setRange(min, max, version);
    if (this.layer instanceof WebGLTileLayer) {
      this.layer.setStyle(buildWebGlStyle(min, max, this.palette));
      this.layer.updateStyleVariables({ kpiMin: min, kpiMax: max });
    }
  }

  setPalette(palette: SignalQualityPalette): void {
    this.palette = palette;
    this.source.setPalette(palette);
    if (this.layer instanceof WebGLTileLayer) {
      this.layer.setStyle(buildWebGlStyle(this.min, this.max, palette));
    }
  }

  setVisible(visible: boolean): void {
    this.layer.setVisible(visible);
  }

  dispose(): void {
    if (this.source instanceof SignalQualityTileSource) {
      this.source.dispose();
    }
  }
}

export default HttpSignalQualityRenderer;
