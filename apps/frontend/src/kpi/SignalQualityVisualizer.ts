import type { SignalQualityDataset } from "./SignalQuality.js";
import type { SignalQualityPalette } from "./SignalQualityPalette.js";
import { SignalQualityTileSource } from "./SignalQualityTileSource.js";

export class SignalQualityVisualizer {
  private readonly source: SignalQualityTileSource;
  private range = { min: 0, max: 100 };

  constructor(
    apiBaseUrl: string,
    private readonly onPaletteChange?: (palette: SignalQualityPalette) => void,
  ) {
    this.source = new SignalQualityTileSource(apiBaseUrl);
  }

  getSource(): SignalQualityTileSource {
    return this.source;
  }

  setDataset(dataset: SignalQualityDataset): void {
    this.range = { min: dataset.min, max: dataset.max };
    this.source.setRange(
      dataset.min,
      dataset.max,
      dataset.version ?? "unversioned",
    );
  }

  setPalette(palette: SignalQualityPalette): void {
    this.source.setPalette(palette);
    this.onPaletteChange?.(palette);
  }

  getRange(): { min: number; max: number } {
    return this.range;
  }
}

export default SignalQualityVisualizer;
