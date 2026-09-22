import Control from 'ol/control/Control.js';
import { CLASS_CONTROL, CLASS_UNSELECTABLE } from 'ol/css.js';

export default class BasemapControl extends Control {
  private readonly button: HTMLButtonElement;
  private readonly switchBasemap: () => string;
  private nextName: () => string;

  constructor(switchBasemap: () => string, nextName: () => string) {
    const element = document.createElement('div');
    element.className = `ol-basemap ${CLASS_UNSELECTABLE} ${CLASS_CONTROL}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'basemap-button';
    element.appendChild(button);
    super({ element });
    this.button = button;
    this.switchBasemap = switchBasemap;
    this.nextName = nextName;
    this.refresh();
    button.addEventListener('click', () => {
      this.switchBasemap();
      this.refresh();
    });
  }

  refresh(): void {
    this.button.textContent = `Switch to ${this.nextName()} Basemap`;
  }
}
