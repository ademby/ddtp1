import { click } from 'ol/events/condition.js';
import type Feature from 'ol/Feature.js';
import Select from 'ol/interaction/Select.js';
import type { SelectEvent } from 'ol/interaction/Select.js';
import type { Coordinate } from 'ol/coordinate.js';
import type { AdminDataset } from '../data/AdminDatasetLoader.js';
import { AdminNode } from '../domain/AdminNode.js';
import type { NavigationState } from '../map/NavigationState.js';
import { MapController } from '../map/MapController.js';
import { shouldUseDefaultTransition } from './navigationTransition.js';

export interface NavigationSearchOption {
  readonly node: AdminNode;
  readonly path: string;
  readonly label: string;
}

interface NavigationSnapshot {
  readonly selected: AdminNode | null;
  readonly path: AdminNode[];
  readonly active: AdminNode[];
  readonly context: AdminNode[];
  readonly center: Coordinate;
  readonly zoom: number;
}

export interface NavigationWorkflowOptions {
  readonly mapWorkspace: NavigationMapWorkspace;
  readonly adminDataset: NavigationDataset;
  readonly locationDisplay: NavigationLocationDisplay;
}

export interface NavigationDataset {
  readonly tree: AdminDataset['tree'];
  getNodeById(id: string): AdminNode | undefined;
  getNodeByFeature(feature: Feature): AdminNode | undefined;
}

export interface NavigationMapWorkspace {
  readonly activeLayer: MapController['activeLayer'];
  addInteraction(interaction: Select): void;
  setContext(features: Feature[]): void;
  setActive(features: Feature[]): void;
  setSelected(feature: Feature | null): void;
  fitViewToFeature(feature: Feature): void;
  fitViewToFeatureHop(feature: Feature): void;
  hopToView(center: Coordinate, zoom: number): void;
  getViewState(): { center: Coordinate; zoom: number };
}

export interface NavigationLocationDisplay {
  setPath(path: AdminNode[]): void;
  clear(): void;
}

export class NavigationWorkflow {
  readonly navigation: NavigationState = {
    selected: null,
    path: [],
    active: [],
    context: [],
  };

  private readonly mapWorkspace: NavigationMapWorkspace;
  private readonly adminDataset: NavigationDataset;
  private readonly locationDisplay: NavigationLocationDisplay;
  private readonly adminSelect: Select;
  private previewState: NavigationSnapshot | null = null;

  constructor(options: NavigationWorkflowOptions) {
    this.mapWorkspace = options.mapWorkspace;
    this.adminDataset = options.adminDataset;
    this.locationDisplay = options.locationDisplay;

    this.adminSelect = new Select({
      condition: click,
      layers: [this.mapWorkspace.activeLayer],
      style: null,
      multi: false,
    });
    this.adminSelect.on('select', (event: SelectEvent) => {
      const feature = event.selected[0];
      if (feature) this.selectNodeByFeature(feature);
    });
    this.mapWorkspace.addInteraction(this.adminSelect);
  }

  getSearchOptions(): NavigationSearchOption[] {
    return this.adminDataset.tree.allNodes().map((node) => {
      const path = this.adminDataset.tree.pathTo(node);
      return {
        node,
        label: String(node.feature.get('shapeName') ?? node.id),
        path: path.map((item) => String(item.feature.get('shapeName') ?? item.id)).join(' / '),
      };
    });
  }

  showInitialRoot(): void {
    const root = this.adminDataset.tree.root;
    this.navigation.selected = null;
    this.navigation.path = [];
    this.navigation.context = [];
    this.navigation.active = [root];
    this.mapWorkspace.setContext([]);
    this.mapWorkspace.setActive([root.feature]);
    this.mapWorkspace.setSelected(null);
    this.locationDisplay.clear();
  }

  selectNode(node: AdminNode | undefined): void {
    if (!node) return;

    const previous = this.navigation.selected;
    const path = this.adminDataset.tree.pathTo(node);
    const activeSet = new Set<AdminNode>();
    for (const child of node.children) activeSet.add(child);
    for (const pathNode of path.slice(1)) {
      if (!pathNode.parent) continue;
      for (const sibling of pathNode.parent.children) {
        if (sibling !== pathNode) activeSet.add(sibling);
      }
    }

    this.navigation.selected = node;
    this.navigation.path = path;
    this.navigation.active = [...activeSet];
    this.navigation.context = path;

    this.mapWorkspace.setContext(path.map((item) => item.feature));
    this.mapWorkspace.setActive(this.navigation.active.map((item) => item.feature));
    this.mapWorkspace.setSelected(node.feature);

    if (shouldUseDefaultTransition(previous, node)) {
      this.mapWorkspace.fitViewToFeature(node.feature);
    } else {
      this.mapWorkspace.fitViewToFeatureHop(node.feature);
    }
    this.locationDisplay.setPath(path);
  }

  selectNodeById(id: string): void {
    this.selectNode(this.adminDataset.getNodeById(id));
  }

  selectNodeByFeature(feature: Feature): void {
    this.selectNode(this.adminDataset.getNodeByFeature(feature));
  }

  previewNode(node: AdminNode): void {
    if (!this.previewState) this.previewState = this.captureNavigation();
    this.selectNode(node);
  }

  restorePreview(): void {
    if (!this.previewState) return;
    const snapshot = this.previewState;
    this.previewState = null;
    this.navigation.selected = snapshot.selected;
    this.navigation.path = snapshot.path;
    this.navigation.active = snapshot.active;
    this.navigation.context = snapshot.context;
    this.mapWorkspace.setContext(snapshot.context.map((item) => item.feature));
    this.mapWorkspace.setActive(snapshot.active.map((item) => item.feature));
    this.mapWorkspace.setSelected(snapshot.selected?.feature ?? null);
    this.locationDisplay.setPath(snapshot.path);
    this.mapWorkspace.hopToView(snapshot.center, snapshot.zoom);
  }

  commitPreview(node: AdminNode): void {
    if (!this.previewState) return;
    this.previewState = null;
    this.navigation.selected = node;
  }

  setSelectionEnabled(enabled: boolean): void {
    this.adminSelect.setActive(enabled);
  }

  private captureNavigation(): NavigationSnapshot {
    const { center, zoom } = this.mapWorkspace.getViewState();
    return {
      selected: this.navigation.selected,
      path: [...this.navigation.path],
      active: [...this.navigation.active],
      context: [...this.navigation.context],
      center,
      zoom,
    };
  }
}

export default NavigationWorkflow;
