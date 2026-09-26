import type Feature from "ol/Feature.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import type { Coordinate } from "ol/coordinate.js";
import { easeOut, inAndOut } from "ol/easing.js";
import type { Extent } from "ol/extent.js";
import { getCenter } from "ol/extent.js";
import type Projection from "ol/proj/Projection.js";
import { BasemapManager } from "./BasemapManager.js";
import BasemapControl from "../ui/BasemapControl.js";

/**
 * Shared map surface and basemap. Feature layers, interactions, and feature UI
 * belong to workflows (ADR-0005 / R-07).
 */
export class MapController {
  readonly map: Map;
  readonly basemapManager: BasemapManager;

  constructor(target = "map-container") {
    this.basemapManager = new BasemapManager();
    this.map = new Map({
      target,
      layers: [...this.basemapManager.getLayers()],
      view: new View({ center: [1064320, 4024067], zoom: 5 }),
    });
    this.map.addControl(
      new BasemapControl(
        () => this.basemapManager.next(),
        () => this.basemapManager.getNextName(),
      ),
    );
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

  getViewState(): { center: Coordinate; zoom: number } {
    const view = this.map.getView();
    const center = view.getCenter();
    const zoom = view.getZoom();
    if (!center || zoom === undefined) {
      throw new Error("Map view is not ready.");
    }
    return { center, zoom };
  }
}
