import type Feature from "ol/Feature.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import type { Coordinate } from "ol/coordinate.js";
import { easeOut, inAndOut } from "ol/easing.js";
import type { Extent } from "ol/extent.js";
import { getCenter } from "ol/extent.js";
import type BaseLayer from "ol/layer/Base.js";
import Layer from "ol/layer/Layer.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import WebGLTileLayer from "ol/layer/WebGLTile.js";
import type Projection from "ol/proj/Projection.js";
import TileSource from "ol/source/Tile.js";
import VectorSource from "ol/source/Vector.js";
import {
  DEFAULT_SIGNAL_QUALITY_PALETTE,
  type SignalQualityPalette,
} from "../kpi/SignalQualityPalette.js";
import { uiConfig } from "../ui.config.js";
import { BasemapManager } from "./BasemapManager.js";
import {
  activeStyle,
  contextStyle,
  hoverStyle,
  measurementStyle,
  missionStyle,
  selectedStyle,
} from "./styles.js";

export class MapController {
  readonly map: Map;
  readonly basemapManager: BasemapManager;
  readonly contextSource = new VectorSource();
  readonly activeSource = new VectorSource();
  readonly selectionSource = new VectorSource();
  readonly hoverSource = new VectorSource();
  readonly missionSource = new VectorSource();
  readonly measurementSource = new VectorSource();
  readonly contextLayer: VectorLayer<VectorSource>;
  readonly activeLayer: VectorLayer<VectorSource>;
  readonly selectionLayer: VectorLayer<VectorSource>;
  readonly hoverLayer: VectorLayer<VectorSource>;
  readonly missionLayer: VectorLayer<VectorSource>;
  readonly measurementLayer: VectorLayer<VectorSource>;
  readonly kpiLayer: Layer;
  private kpiPalette: SignalQualityPalette = DEFAULT_SIGNAL_QUALITY_PALETTE;
  private kpiMin = 0;
  private kpiMax = 100;

  constructor(target = "map-container") {
    this.basemapManager = new BasemapManager();
    this.contextLayer = new VectorLayer({
      source: this.contextSource,
      style: contextStyle,
      zIndex: 10,
    });
    this.activeLayer = new VectorLayer({
      source: this.activeSource,
      style: activeStyle,
      zIndex: 20,
    });
    this.selectionLayer = new VectorLayer({
      source: this.selectionSource,
      style: selectedStyle,
      zIndex: 30,
    });
    this.hoverLayer = new VectorLayer({
      source: this.hoverSource,
      style: hoverStyle,
      zIndex: 40,
    });
    this.missionLayer = new VectorLayer({
      source: this.missionSource,
      style: missionStyle,
      zIndex: 50,
    });
    this.measurementLayer = new VectorLayer({
      source: this.measurementSource,
      style: measurementStyle,
      zIndex: 55,
    });

    this.kpiLayer =
      uiConfig.kpiRenderer === "canvas"
        ? new TileLayer({
            zIndex: 45,
            opacity: 0.78,
            visible: false,
            cacheSize: 1024,
          })
        : new WebGLTileLayer({
            zIndex: 45,
            opacity: 0.78,
            visible: false,
            cacheSize: 1024,
            // style: this.buildKpiStyle(this.kpiMin, this.kpiMax, this.kpiPalette),
            style: {
              variables: {
                kpiMin: 0.01,
                kpiMax: 0.02,
              },
              color: [
                "case",
                ["==", ["band", 2], 0],
                [0, 0, 0, 0],

                [
                  "interpolate",
                  ["linear"],
                  ["band", 1],
                  ["var", "kpiMin"],
                  [0, 0, 0, 1],
                  ["var", "kpiMax"],
                  [255, 255, 255, 1],
                ],
              ],
            },
          });

    this.map = new Map({
      target,
      layers: [
        ...this.basemapManager.getLayers(),
        this.kpiLayer,
        this.contextLayer,
        this.activeLayer,
        this.selectionLayer,
        this.missionLayer,
        this.measurementLayer,
        this.hoverLayer,
      ],
      view: new View({ center: [1064320, 4024067], zoom: 5 }),
    });
  }

  setKpiSource(source: TileSource): void {
    this.kpiLayer.setSource(source);
  }

  /* WEBGL Stuff */ // refactor [put in corresponding workflow]
  private buildKpiStyle(
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

    const color: any[] = ["interpolate", ["linear"], normalized];

    for (const stop of palette) {
      color.push(stop.offset, stop.color);
    }

    return {
      color,
    };
  }

  setKpiPalette(palette: SignalQualityPalette): void {
    this.kpiPalette = palette;
    if (this.kpiLayer instanceof WebGLTileLayer) {
      this.kpiLayer.setStyle(
        this.buildKpiStyle(this.kpiMin, this.kpiMax, this.kpiPalette),
      );
    }
  }

  setKpiRange(min: number, max: number): void {
    this.kpiMin = min;
    this.kpiMax = max;
    if (this.kpiLayer instanceof WebGLTileLayer) {
      this.kpiLayer.setStyle(
        this.buildKpiStyle(this.kpiMin, this.kpiMax, this.kpiPalette),
      );
      this.kpiLayer.updateStyleVariables({
        kpiMin: min,
        kpiMax: max,
      });
    }
  }

  setKpiVisible(visible: boolean): void {
    this.kpiLayer.setVisible(visible);
  }

  isKpiVisible(): boolean {
    return this.kpiLayer.getVisible();
  }

  setContext(features: Feature[]): void {
    this.contextSource.clear();
    this.contextSource.addFeatures(features);
  }

  setActive(features: Feature[]): void {
    this.activeSource.clear();
    this.activeSource.addFeatures(features);
  }

  setSelected(feature: Feature | null): void {
    this.selectionSource.clear();
    if (feature) this.selectionSource.addFeature(feature);
  }

  setHovered(features: Feature[]): void {
    this.hoverSource.clear();
    this.hoverSource.addFeatures(features);
  }

  clearHover(): void {
    this.hoverSource.clear();
  }

  setMission(feature: Feature | null): void {
    this.missionSource.clear();
    if (feature) this.missionSource.addFeature(feature);
  }

  clearMission(): void {
    this.missionSource.clear();
  }

  setMeasurements(features: Feature[]): void {
    this.measurementSource.clear();
    this.measurementSource.addFeatures(features);
  }

  clearMeasurements(): void {
    this.measurementSource.clear();
  }

  fitViewToFeature(feature: Feature): void {
    const geometry = feature.getGeometry();
    if (!geometry) return;
    this.map.getView().fit(geometry.getExtent(), {
      padding: [70, 70, 70, 70],
      duration: 450,
      maxZoom: 21,
    });
  }

  fitViewToFeatureHop(feature: Feature): void {
    const geometry = feature.getGeometry();
    const size = this.map.getSize();
    if (!geometry || !size) return;

    const view = this.map.getView();
    const extent = geometry.getExtent();
    const currentCenter = view.getCenter();
    const currentResolution = view.getResolution();
    if (!currentCenter || !currentResolution) {
      this.fitViewToFeature(feature);
      return;
    }

    const targetCenter = getCenter(extent);
    const targetResolution = view.getResolutionForExtent(extent, [
      Math.max(size[0] - 140, 1),
      Math.max(size[1] - 140, 1),
    ]);

    view.cancelAnimations();
    const intermediateResolution =
      Math.max(currentResolution, targetResolution) * 1.8;
    view.animate(
      { resolution: intermediateResolution, duration: 320, easing: easeOut },
      {
        center: targetCenter,
        resolution: targetResolution,
        duration: 760,
        easing: inAndOut,
      },
    );
  }

  hopToView(center: Coordinate, zoom: number): void {
    const view = this.map.getView();
    const currentResolution = view.getResolution();
    const targetResolution = view.getResolutionForZoom(zoom);
    if (!currentResolution || !targetResolution) {
      view.setCenter(center);
      view.setZoom(zoom);
      return;
    }

    view.cancelAnimations();
    const intermediateResolution =
      Math.max(currentResolution, targetResolution) * 1.8;
    view.animate(
      { resolution: intermediateResolution, duration: 320, easing: easeOut },
      { center, resolution: targetResolution, duration: 760, easing: inAndOut },
    );
  }

  fitViewToExtent(extent: Extent): void {
    this.map.getView().fit(extent, {
      padding: [100, 100, 100, 100],
      duration: 450,
      maxZoom: 18,
    });
  }

  getProjection(): Projection {
    return this.map.getView().getProjection();
  }

  setLayerVisible(layer: BaseLayer, visible: boolean): void {
    layer.setVisible(visible);
  }
}
