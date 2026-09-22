import type { SignalQualityDataset } from "./SignalQuality.js";
import type { SignalQualityPalette } from "./SignalQualityPalette.js";
import { SignalQualityTileSource_ForWebGL } from "./SignalQualityTileSource_ForWebGL.js";

export class SignalQualityVisualizer_ForWebGL {
  private readonly source: SignalQualityTileSource_ForWebGL;
  private range = { min: 0, max: 100 };

  constructor(
    apiBaseUrl: string,
    private readonly onPaletteChange?: (palette: SignalQualityPalette) => void,
    private readonly onRangeChange?: (min: number, max: number) => void,
  ) {
    this.source = new SignalQualityTileSource_ForWebGL(apiBaseUrl);
  }

  getSource(): SignalQualityTileSource_ForWebGL {
    return this.source;
  }

  setDataset(dataset: SignalQualityDataset): void {
    this.range = { min: dataset.min, max: dataset.max };
    this.source.setRange(
      dataset.min,
      dataset.max,
      dataset.version ?? "unversioned",
    );
    this.onRangeChange?.(dataset.min, dataset.max);
  }

  setPalette(palette: SignalQualityPalette): void {
    this.source.setPalette(palette);
    this.onPaletteChange?.(palette);
  }

  getRange(): { min: number; max: number } {
    return this.range;
  }
}

export default SignalQualityVisualizer_ForWebGL;
