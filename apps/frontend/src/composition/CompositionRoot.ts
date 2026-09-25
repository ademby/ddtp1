import type { MissionApi } from "@drone-drive/contracts/mission";
import type { MissionResultApi } from "@drone-drive/contracts/mission-result";
import Control from "ol/control/Control";
import type { AdminDataset } from "../data/AdminDatasetLoader";
import AdminDatasetLoader from "../data/AdminDatasetLoader";
import HttpMissionApi from "../data/HttpMissionApi";
import HttpMissionResultApi from "../data/HttpMissionResultApi";
import { MockMissionApi } from "../data/MockMissionApi";
import type { SignalQualityPalette } from "../kpi/SignalQualityPalette";
import SignalQualityService from "../kpi/SignalQualityService";
import SignalQualityVisualizer from "../kpi/SignalQualityVisualizer";
import { MapController } from "../map/MapController";
import type { NavigationState } from "../map/NavigationState";
import { MeasurementReviewController } from "../mission/MeasurementReview";
import { MissionEditor } from "../mission/MissionEditor";
import BasemapControl from "../ui/BasemapControl";
import Breadcrumbs from "../ui/Breadcrumbs";
import LocationSearch from "../ui/LocationSearch";
import type { MissionFormData } from "../ui/MissionOperationsView";
import OperationsPanel from "../ui/OperationsPanel";
import SignalQualityLegend from "../ui/SignalQualityLegend";
import { HeatmapWorkflow } from "../workflows/HeatmapWorkflow";
import { MissionWorkflow } from "../workflows/MissionWorkflow";
import { NavigationWorkflow } from "../workflows/NavigationWorkflow";

export interface CompositionRootOptions {
  datasetURL?: string;
}

export class CompositionRoot {
  readonly mapController: MapController;
  readonly missionApi: MissionApi;
  readonly missionResultApi: MissionResultApi | undefined;
  readonly signalQualityService: SignalQualityService;
  readonly adminDataset: AdminDataset;
  readonly navigationWorkflow: NavigationWorkflow;
  readonly missionWorkflow: MissionWorkflow;
  readonly heatmapWorkflow: HeatmapWorkflow;
  readonly operationsPanel: OperationsPanel;
  readonly measurementReview: MeasurementReviewController;

  private constructor(
    mapController: MapController,
    adminDataset: AdminDataset,
  ) {
    this.mapController = mapController;
    this.adminDataset = adminDataset;
    this.missionApi = import.meta.env.VITE_API_BASE_URL
      ? new HttpMissionApi(import.meta.env.VITE_API_BASE_URL)
      : new MockMissionApi();
    this.missionResultApi = new HttpMissionResultApi(
      import.meta.env.VITE_API_BASE_URL,
    );
    this.signalQualityService = new SignalQualityService(
      import.meta.env.VITE_API_BASE_URL,
    );

    let selectNodeById: (id: string) => void = () => {
      throw new Error("Navigation workflow is not ready.");
    };
    const locationDisplay = new Breadcrumbs((id) => selectNodeById(id));
    this.mapController.map.addControl(locationDisplay);

    this.navigationWorkflow = new NavigationWorkflow({
      mapWorkspace: {
        activeLayer: this.mapController.activeLayer,
        addInteraction: (interaction) =>
          this.mapController.map.addInteraction(interaction),
        setContext: (features) => this.mapController.setContext(features),
        setActive: (features) => this.mapController.setActive(features),
        setSelected: (feature) => this.mapController.setSelected(feature),
        fitViewToFeature: (feature) =>
          this.mapController.fitViewToFeature(feature),
        fitViewToFeatureHop: (feature) =>
          this.mapController.fitViewToFeatureHop(feature),
        hopToView: (center, zoom) => this.mapController.hopToView(center, zoom),
        getViewState: () => {
          const view = this.mapController.map.getView();
          const center = view.getCenter();
          const zoom = view.getZoom();
          if (!center || zoom === undefined)
            throw new Error("Map view is not ready for location preview.");
          return { center, zoom };
        },
      },
      adminDataset: this.adminDataset,
      locationDisplay,
    });
    selectNodeById = (id) => this.navigationWorkflow.selectNodeById(id);
    const locationSearch = new LocationSearch({
      options: this.navigationWorkflow.getSearchOptions(),
      onPreviewStart: (node) => this.navigationWorkflow.previewNode(node),
      onPreviewEnd: () => this.navigationWorkflow.restorePreview(),
      onPreviewCommit: (node) => this.navigationWorkflow.commitPreview(node),
      onSelect: (node) => this.navigationWorkflow.selectNode(node),
    });
    this.mapController.map.addControl(
      new Control({ element: locationSearch.element }),
    );

    const basemap = new BasemapControl(
      () => this.mapController.basemapManager.next(),
      () => this.mapController.basemapManager.getNextName(),
    );
    this.mapController.map.addControl(basemap);

    const legend = new SignalQualityLegend();
    this.mapController.map.addControl(legend);
    legend.setRange(0, 100);
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    const visualizer = new SignalQualityVisualizer(
      apiBase,
      (palette) => this.mapController.setKpiPalette(palette),
      (min, max) => this.mapController.setKpiRange(min, max),
    );
    this.mapController.setKpiSource(visualizer.getSource());
    this.heatmapWorkflow = new HeatmapWorkflow({
      mapWorkspace: {
        isVisible: () => this.mapController.isKpiVisible(),
        setVisible: (visible) => this.mapController.setKpiVisible(visible),
      },
      dataSource: this.signalQualityService,
      renderer: visualizer,
      legend,
    });

    let handleEditorMode: (
      mode: Parameters<MissionWorkflow["handleEditorMode"]>[0],
    ) => void = () => {
      throw new Error("Mission workflow is not ready.");
    };
    this.measurementReview = new MeasurementReviewController(
      this.mapController.map,
      this.mapController.measurementSource,
      this.mapController.measurementLayer,
      this.mapController.getProjection(),
      {
        onSelectionChange: (ids) =>
          this.operationsPanel.setMeasurementSelection(ids),
        onRejectedChange: (ids) =>
          this.operationsPanel.setMeasurementRejection(ids),
      },
    );
    const missionEditor = new MissionEditor(
      this.mapController.map,
      this.mapController.missionSource,
      this.mapController.getProjection(),
      (mode) => handleEditorMode(mode),
    );
    const missionCallbacks = {
      onNew: () => this.missionWorkflow.create(),
      onSelect: (id: string) => this.missionWorkflow.select(id),
      onDraw: () => this.missionWorkflow.startDraw(),
      onModify: () => this.missionWorkflow.startModify(),
      onTranslate: () => this.missionWorkflow.startTranslate(),
      onUndo: () => this.missionWorkflow.undo(),
      onRedo: () => this.missionWorkflow.redo(),
      onSave: (data: MissionFormData) => void this.missionWorkflow.save(data),
      onPlan: () => void this.missionWorkflow.plan(),
      onCancel: () => this.missionWorkflow.cancel(),
      onBack: () => this.missionWorkflow.back(),
      onCancelMission: () => void this.missionWorkflow.cancelMission(),
      onRetryMission: () => void this.missionWorkflow.retry(),
      onSaveReview: () =>
        void this.missionWorkflow.saveReview(
          this.measurementReview.getRejectedIds(),
          false,
        ),
      onFinalizeReview: () =>
        void (async () => {
          const saved = await this.missionWorkflow.saveReview(
            this.measurementReview.getRejectedIds(),
            true,
          );
          // Finalizing is what changes the approved-measurement set the heatmap reads; refresh
          // it now rather than leaving stale tiles until someone hits "Refresh data".
          if (saved) await this.heatmapWorkflow.refresh();
        })(),
      onSelectMeasurement: (id: string, additive: boolean) =>
        this.measurementReview.selectById(id, additive),
      onSelectAllMeasurements: () => this.measurementReview.selectAll(),
      onInvertMeasurementSelection: () =>
        this.measurementReview.invertSelection(),
      onClearMeasurementSelection: () =>
        this.measurementReview.clearSelection(),
      onApproveSelectedMeasurements: () =>
        this.measurementReview.approveSelected(),
      onRejectSelectedMeasurements: () =>
        this.measurementReview.rejectSelected(),
      onToggleKpi: () => void this.heatmapWorkflow.toggle(),
      onRefreshKpi: () => void this.heatmapWorkflow.refresh(),
      onPaletteChange: (palette: SignalQualityPalette) => {
        // Intermediate edits (e.g. a stop dragged past a neighbor) can be briefly invalid;
        // the map simply keeps its last valid palette until the edit settles.
        try {
          this.heatmapWorkflow.setPalette(palette);
        } catch {
          /* ignore transient invalid state */
        }
      },
      onPaletteReset: () => this.heatmapWorkflow.resetPalette(),
    };
    this.operationsPanel = new OperationsPanel(
      missionCallbacks,
      this.heatmapWorkflow.getPalette(),
    );
    this.missionWorkflow = new MissionWorkflow({
      mapWorkspace: {
        fitMission: (id) => {
          const feature = this.mapController.missionSource.getFeatureById(id);
          if (feature) this.mapController.fitViewToFeature(feature);
        },
        clearMission: () => this.mapController.clearMission(),
        setEditorMode: (mode) => {
          const target = this.mapController.map.getTargetElement();
          if (!(target instanceof HTMLElement)) return;
          target.classList.remove(
            "cursor-draw",
            "cursor-modify",
            "cursor-translate",
          );
          if (mode !== "idle") target.classList.add(`cursor-${mode}`);
        },
        showMeasurements: (result) => this.measurementReview.load(result),
        clearMeasurements: () => this.measurementReview.clear(),
      },
      missionApi: this.missionApi,
      missionResultApi: this.missionResultApi,
      missionEditor,
      view: this.operationsPanel,
      setAdminSelectionEnabled: (enabled) =>
        this.navigationWorkflow.setSelectionEnabled(enabled),
    });
    handleEditorMode = (mode) => this.missionWorkflow.handleEditorMode(mode);
  }

  static async create(
    options: CompositionRootOptions = {},
  ): Promise<CompositionRoot> {
    const mapController = new MapController();
    const adminDataset = await AdminDatasetLoader.loadDataset({
      featureProjection: mapController.getProjection(),
      url: options.datasetURL,
    });
    const compositionRoot = new CompositionRoot(mapController, adminDataset);
    compositionRoot.navigationWorkflow.showInitialRoot();
    void compositionRoot.missionWorkflow.load();
    void compositionRoot.heatmapWorkflow.load();
    return compositionRoot;
  }

  get navigation(): NavigationState {
    return this.navigationWorkflow.navigation;
  }
}

export default CompositionRoot;
