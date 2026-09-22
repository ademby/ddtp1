import type BaseLayer from 'ol/layer/Base.js';
import LayerGroup from 'ol/layer/Group.js';
import TileLayer from 'ol/layer/Tile.js';
import { OSM, StadiaMaps } from 'ol/source.js';
import Esri from './Esri.js';

export interface Basemap {
  name: string;
  layer: BaseLayer;
}

export class BasemapManager {
  private readonly basemaps: Basemap[];
  private index = 0;

  constructor() {
    this.basemaps = this.createDefaults();
    this.syncVisibility();
  }

  getLayers(): BaseLayer[] {
    return this.basemaps.map(({ layer }) => layer);
  }

  add(name: string, layer: BaseLayer): void {
    layer.setVisible(false);
    this.basemaps.push({ name, layer });
  }

  next(): string {
    this.index = (this.index + 1) % this.basemaps.length;
    this.syncVisibility();
    return this.getCurrentName();
  }

  getCurrentName(): string {
    return this.basemaps[this.index].name;
  }

  getNextName(): string {
    return this.basemaps[(this.index + 1) % this.basemaps.length].name;
  }

  private syncVisibility(): void {
    this.basemaps.forEach(({ layer }, index) => layer.setVisible(index === this.index));
  }

  private createDefaults(): Basemap[] {
    return [
      {
        name: 'Stadia Alidade',
        layer: new TileLayer({
          source: new StadiaMaps({ layer: 'alidade_smooth', retina: true }),
        }),
      },
      {
        name: 'Stadia OSM',
        layer: new TileLayer({
          source: new StadiaMaps({ layer: 'osm_bright' })
        }),
      },
      { name: 'OSM', layer: new TileLayer({ source: new OSM() }) },
      {
        name: 'Stadia Stamen',
        layer: new LayerGroup({
          layers: [
            new TileLayer({ source: new StadiaMaps({ layer: 'stamen_watercolor' }) }),
            new TileLayer({ source: new StadiaMaps({ layer: 'stamen_terrain_labels' }) }),
          ],
        }),
      },
      { name: 'Esri', layer: new TileLayer({ source: new Esri() }) },
    ];
  }
}
