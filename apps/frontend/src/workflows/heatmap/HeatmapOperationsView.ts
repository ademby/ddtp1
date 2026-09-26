import type { SignalQualityPalette } from './SignalQualityPalette.js';

export interface HeatmapOperationsViewCallbacks {
  onToggle(): void;
  onRefresh(): void;
  onPaletteChange(palette: SignalQualityPalette): void;
  onPaletteReset(): void;
}

export class HeatmapOperationsView {
  private readonly stopsContainer: HTMLElement;

  constructor(
    readonly element: HTMLElement,
    initialPalette: SignalQualityPalette,
    private readonly callbacks: HeatmapOperationsViewCallbacks,
  ) {
    element.querySelector('.toggle-kpi')?.addEventListener('click', callbacks.onToggle);
    // Tiles are cached client-side by data version; measurements reviewed/finalized elsewhere
    // won't appear until this re-fetches the current version. See HeatmapWorkflow.refresh().
    element.querySelector('.refresh-kpi')?.addEventListener('click', callbacks.onRefresh);
    this.stopsContainer = element.querySelector('.palette-stops') as HTMLElement;
    element.querySelector('.palette-add-stop')?.addEventListener('click', () => this.addStop());
    element.querySelector('.palette-reset')?.addEventListener('click', () => {
      callbacks.onPaletteReset();
      this.renderPalette(initialPalette);
    });
    this.renderPalette(initialPalette);
  }

  /** Re-renders the stop editor rows to reflect an externally-set palette (e.g. after reset). */
  renderPalette(palette: SignalQualityPalette): void {
    this.stopsContainer.innerHTML = '';
    palette.forEach((stop, index) => {
      const row = document.createElement('div');
      row.className = 'palette-stop';
      /*html*/
      row.innerHTML = `
        <input type="color" class="palette-color" value="${stop.color}">
        <input type="number" class="palette-offset" min="0" max="1" step="0.05" value="${stop.offset}">
        <button type="button" class="icon-button palette-remove" aria-label="Remove stop">×</button>`;
      const colorInput = row.querySelector('.palette-color') as HTMLInputElement;
      const offsetInput = row.querySelector('.palette-offset') as HTMLInputElement;
      const removeButton = row.querySelector('.palette-remove') as HTMLButtonElement;

      colorInput.addEventListener('input', () => this.commit());
      offsetInput.addEventListener('change', () => this.commit());
      removeButton.addEventListener('click', () => {
        row.remove();
        this.commit();
      });
      if (palette.length <= 2) removeButton.disabled = true;

      this.stopsContainer.appendChild(row);
    });
  }

  private addStop(): void {
    const current = this.readPalette();
    const midpoint = current.length >= 2
      ? (current[current.length - 2].offset + current[current.length - 1].offset) / 2
      : 0.5;
    this.renderPalette([
      ...current.slice(0, -1),
      { offset: Math.round(midpoint * 100) / 100, color: '#808080' }, // IMPROVE ME
      current[current.length - 1],
    ]);
    this.commit();
  }

  private commit(): void {
    this.callbacks.onPaletteChange(this.readPalette());
  }

  private readPalette(): SignalQualityPalette {
    return [...this.stopsContainer.querySelectorAll('.palette-stop')].map((row) => ({
      color: (row.querySelector('.palette-color') as HTMLInputElement).value,
      offset: Number((row.querySelector('.palette-offset') as HTMLInputElement).value),
    })).sort((a, b) => a.offset - b.offset);
  }
}
