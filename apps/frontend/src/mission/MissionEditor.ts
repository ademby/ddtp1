import Feature from 'ol/Feature.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Translate from 'ol/interaction/Translate.js';
import Snap from 'ol/interaction/Snap.js';
import LineString from 'ol/geom/LineString.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { getLength } from 'ol/sphere.js';
import type Map from 'ol/Map.js';
import type VectorSource from 'ol/source/Vector.js';
import Collection from 'ol/Collection.js';
import type { LineStringGeometry, Mission } from '@drone-drive/contracts/mission';
import type Projection from 'ol/proj/Projection.js';

export type MissionEditorMode = 'idle' | 'draw' | 'modify' | 'translate';

export class MissionEditor {
  private readonly map: Map;
  private readonly source: VectorSource;
  private readonly projection: Projection;
  private feature: Feature<LineString> | null = null;
  private draw: Draw | null = null;
  private modify: Modify | null = null;
  private translate: Translate | null = null;
  private snap: Snap | null = null;
  private undoStack: LineStringGeometry[] = [];
  private redoStack: LineStringGeometry[] = [];
  private historySuspended = false;
  private readonly onModeChange: (mode: MissionEditorMode) => void;

  constructor(
    map: Map,
    source: VectorSource,
    projection: Projection,
    onModeChange: (mode: MissionEditorMode) => void = () => undefined,
  ) {
    this.map = map;
    this.source = source;
    this.projection = projection;
    this.onModeChange = onModeChange;
  }

  load(mission: Mission): void {
    this.disableInteractions();
    this.source.clear();
    this.feature = new Feature(new GeoJSON().readGeometry(mission.activeRoute.geometry, {
      dataProjection: 'EPSG:4326',
      featureProjection: this.projection,
    }) as LineString);
    this.feature.setId(mission.id);
    this.source.addFeature(this.feature);
    this.resetHistory();
  }

  startNew(): Feature<LineString> {
    this.disableInteractions();
    this.source.clear();
    this.feature = null;
    this.resetHistory();
    this.enableDraw();
    this.onModeChange('draw');
    return new Feature(new LineString([]));
  }

  startDraw(): void {
    this.disableInteractions();
    this.source.clear();
    this.feature = null;
    this.resetHistory();
    this.enableDraw();
    this.onModeChange('draw');
  }

  startModify(): void {
    if (!this.feature) return;
    this.disableInteractions();
    this.enableModify();
    this.onModeChange('modify');
  }

  startTranslate(): void {
    if (!this.feature) return;
    this.disableInteractions();
    this.enableTranslate();
    this.onModeChange('translate');
  }

  stop(): void {
    this.disableInteractions();
    this.onModeChange('idle');
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous || !this.feature) return;
    this.redoStack.push(this.geometryData());
    this.apply(previous);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next || !this.feature) return;
    this.undoStack.push(this.geometryData());
    this.apply(next);
  }

  getGeometry(): LineStringGeometry {
    if (!this.feature) return { type: 'LineString', coordinates: [] };
    const geometry = new GeoJSON().writeGeometryObject(this.feature.getGeometry()!, {
      featureProjection: this.projection,
      dataProjection: 'EPSG:4326',
      decimals: 7,
    }) as unknown as LineStringGeometry;
    return geometry;
  }

  getLengthMeters(): number {
    if (!this.feature) return 0;
    return getLength(this.feature.getGeometry()!);
  }

  hasValidGeometry(): boolean {
    return this.getGeometry().coordinates.length >= 2;
  }

  private geometryData(): LineStringGeometry {
    return this.getGeometry();
  }

  private apply(value: LineStringGeometry): void {
    this.historySuspended = true;
    try {
      const geometry = new GeoJSON().readGeometry(value, {
        dataProjection: 'EPSG:4326',
        featureProjection: this.projection,
      }) as LineString;
      this.feature?.setGeometry(geometry);
    } finally {
      this.historySuspended = false;
    }
  }

  private resetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private capture(): void {
    if (this.historySuspended || !this.feature || !this.hasValidGeometry()) return;
    this.undoStack.push(this.geometryData());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  private enableDraw(): void {
    this.draw = new Draw({ source: this.source, type: 'LineString' });
    this.draw.on('drawstart', () => {
      this.undoStack.push({ type: 'LineString', coordinates: [] });
      this.redoStack = [];
    });
    this.draw.on('drawend', (event: any) => {
      this.feature = event.feature as Feature<LineString>;
      this.disableInteractions();
    });
    this.map.addInteraction(this.draw);
    this.enableSnap();
  }

  private enableModify(): void {
    if (!this.feature) return;
    this.modify = new Modify({ features: new Collection([this.feature]) });
    this.modify.on('modifystart', () => this.capture());
    this.modify.on('modifyend', () => undefined);
    this.map.addInteraction(this.modify);
    this.enableSnap();
  }

  private enableTranslate(): void {
    if (!this.feature) return;
    this.translate = new Translate({ features: new Collection([this.feature]) });
    this.translate.on('translatestart', () => this.capture());
    this.translate.on('translateend', () => undefined);
    this.map.addInteraction(this.translate);
  }

  private enableSnap(): void {
    this.snap = new Snap({ source: this.source });
    this.map.addInteraction(this.snap);
  }

  private disableInteractions(): void {
    if (this.draw) this.map.removeInteraction(this.draw);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.translate) this.map.removeInteraction(this.translate);
    if (this.snap) this.map.removeInteraction(this.snap);
    this.draw = null;
    this.modify = null;
    this.translate = null;
    this.snap = null;
  }
}
