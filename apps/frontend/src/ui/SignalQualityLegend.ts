import Control from 'ol/control/Control.js';
import { paletteToCssGradient, type SignalQualityPalette } from '../kpi/SignalQualityPalette.js';

export default class SignalQualityLegend extends Control {
  private readonly minLabel: HTMLSpanElement;
  private readonly maxLabel: HTMLSpanElement;
  private readonly gradient: HTMLDivElement;
  declare public readonly element: HTMLElement;

  constructor() {
    const element = document.createElement('div');
    element.className = 'signal-legend ol-unselectable ol-control';
    element.innerHTML = '<div class="signal-legend-title">Signal Quality</div><div class="signal-gradient"></div><div class="signal-legend-labels"><span></span><span></span></div>';
    super({ element });
    element.style.display = 'none';
    const labels = element.querySelectorAll('span');
    this.minLabel = labels[0] as HTMLSpanElement;
    this.maxLabel = labels[1] as HTMLSpanElement;
    this.gradient = element.querySelector('.signal-gradient') as HTMLDivElement;
  }

  setRange(min: number, max: number): void {
    this.minLabel.textContent = String(Math.round(min));
    this.maxLabel.textContent = String(Math.round(max));
  }

  /** Keeps the legend's gradient bar an exact match for what the map is actually rendering. */
  setPalette(palette: SignalQualityPalette): void {
    this.gradient.style.background = paletteToCssGradient(palette);
  }
}
