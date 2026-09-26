# Deep-module architecture proposal

Design settled in R-05 and implemented through R-06..R-08. Criterion: **substantial functionality + simple interface + hidden complexity**.  
Guiding question: **whose responsibility is this?**

This document remains the ownership / interface reference. Physical hierarchy and MapWorkspace removal are done; do not reintroduce pass-through shims.

---

## Settled decisions (grill summary)

| Decision | Choice |
| -------- | ------ |
| Primary unit | Workflow-centric: each feature lives under `workflows/<name>/` |
| Workflow owns | App state, its map layers/interactions, its HTTP Api, its feature UI |
| Shared only | Map shell, panel host, true cross-workflow commons |
| MapController | `map`, basemap, projection, view helpers — no feature layers |
| `*MapWorkspace` | Delete; no pass-through shims |
| Transport naming | `Http*Api` implementing contract `*Api` — not DataSource/Service |
| Signal Quality HTTP | Full contract: `getRange` **and** `getTile`; sole HTTP owner |
| Tile loaders | Call `SignalQualityApi.getTile` — never raw `fetch`/`apiBaseUrl` |
| Paint module name | **`SignalQualityRenderer`** (not “surface”) |
| Heatmap workflow name | Keep **`HeatmapWorkflow`** |
| SQ vs Kpi prefix | Keep Signal Quality until a second KPI exists |
| Cross-workflow | **No** Mission→Heatmap refresh; **no** workflow disables another |
| After finalize | Mission UI shows **fading advisory popup** to refresh heatmap |
| Live updates | Future SSE with `receiver` field — see `docs/future-features.md` |
| Mocks | Remove frontend `MockMissionApi`; keep `apps/drone-mock` |
| Admin types | `AdminNode` / `AdminTree` / loader under **navigation** |
| Backend modules | Keep Mission / MissionResult / SignalQuality + event (unchanged) |
| ExecutionAttempt | Still not a first-class entity |

---

## Ownership map

| Concern | Owner | Not owner |
| -------- | ----- | --------- |
| HTTP missions / results | `HttpMissionApi`, `HttpMissionResultApi` (mission workflow) | Other workflows, renderer |
| HTTP Signal Quality (range + tiles) | `HttpSignalQualityApi` (heatmap workflow) | Tile sources, MapController |
| Numeric tile + palette → map layer | `SignalQualityRenderer` | Api client, workflow app logic |
| Palette, visibility, when to load range | `HeatmapWorkflow` | Api, MapController |
| Admin nav state + admin layers | `NavigationWorkflow` | MapController |
| Mission list/edit/plan/review decisions | `MissionWorkflow` | MapController |
| Route geometry interactions | `MissionEditor` | Workflow (calls it only) |
| Measurement select/approve/reject on map | `MeasurementReview` | Workflow (calls it only) |
| OL Map, basemap, view animation | `MapController` | Workflows |
| Map interaction exclusivity | Map shell lock (principle; detail in R-07) | Workflow→workflow calls |
| Panel shell | `OperationsPanel` as register-view host | Feature domain logic |
| Composition | `CompositionRoot` construct + wire only | Feature logic, layer build |
| Finalize → projection freshness | Backend authority; operator refresh (+ popup) until SSE | Cross-workflow calls |

---

## Frontend modules

### 1. MapController

**Responsibility** Shared map surface and basemap.

**Public interface**
```ts
class MapController {
  readonly map: Map;
  readonly basemapManager: BasemapManager;
  getProjection(): Projection;
  fitViewToFeature(feature: Feature): void;
  fitViewToFeatureHop(feature: Feature): void;
  hopToView(center: Coordinate, zoom: number): void;
  fitViewToExtent(extent: Extent): void;
}
```

**Hidden** Map/View construction, basemap layers, easing, basemap control registration.

**R-07 note** Interaction exclusivity (navigate vs edit-route vs review) is owned by the map shell, not by workflows calling each other. Exact API deferred to R-07; R-05 forbids `navigation.setSelectionEnabled` from MissionWorkflow.

---

### 2. HttpSignalQualityApi

**Responsibility** All client↔backend Signal Quality traffic.

**Public interface** — contract is authoritative:
```ts
interface SignalQualityApi {
  getRange(): Promise<SignalQualityRange>;
  getTile(coord: SignalQualityTileCoord): Promise<SignalQualityTile>;
}
class HttpSignalQualityApi implements SignalQualityApi { ... }
```

**Hidden** Base URL, `signalQualityTilePath`, version query, Float32 decode, errors.

**Callers** `HeatmapWorkflow` (`getRange`); `SignalQualityRenderer` tile loaders (`getTile`).

**Replaces** range-only `SignalQualityService` and inline `fetch` in both tile sources.

---

### 3. SignalQualityRenderer

**Responsibility** Turn numeric tiles + palette into the map layer. Not network. Not operator state.

**Public interface**
```ts
interface SignalQualityRenderer {
  readonly layer: BaseLayer;
  setRange(min: number, max: number, version: string): void;
  setPalette(palette: SignalQualityPalette): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
```

**Hidden** Canvas vs WebGL from `uiConfig.kpiRenderer` (both retained, ADR-0006); worker colorization; numeric cache; loaders call `api.getTile(coord)`.

**Caller** `HeatmapWorkflow` only.

**Retired** `SignalQualityVisualizer` callbacks into MapController; tile sources taking `apiBaseUrl`.

---

### 4. HeatmapWorkflow

**Responsibility** Operator-facing exploration: visibility, palette, when to load/refresh range.

**Public interface**
```ts
class HeatmapWorkflow {
  constructor(options: {
    mapController: MapController;
    signalQualityApi: SignalQualityApi;
    renderer: SignalQualityRenderer;
    legend: SignalQualityLegend;
    initialPalette?: SignalQualityPalette;
  });
  load(): Promise<void>;
  refresh(): Promise<void>;
  toggle(): Promise<void>;
  getPalette(): SignalQualityPalette;
  setPalette(palette: SignalQualityPalette): void;
  resetPalette(): void;
}
```

**Hidden** Own LayerGroup / attach `renderer.layer`; sync legend; `api.getRange` then `renderer.setRange`. Does **not** fetch tiles; does **not** listen to MissionWorkflow.

**Callers** CompositionRoot; operations panel toggle/palette; **operator** Refresh (and future SSE → this workflow).

---

### 5. Mission transport

**Responsibility** Mission and result HTTP.

**Interface** Contracts `MissionApi`, `MissionResultApi`.  
**Concrete** `HttpMissionApi`, `HttpMissionResultApi` only. **No** `MockMissionApi`.

---

### 6. MissionEditor

**Responsibility** Route geometry editing (draw / modify / translate / undo-redo).

**Interface** Existing `MissionRouteEditor`-shaped API.

**Depends on** Map + vector source **owned by MissionWorkflow**.

---

### 7. MeasurementReview

**Responsibility** Measurement points on map + select / approve / reject during review.

**Depends on** Map + measurement source owned by MissionWorkflow.

---

### 8. MissionWorkflow

**Responsibility** Mission application decisions: list, select, create, edit lifecycle, plan/cancel/retry, review save/finalize.

**Constructor** `MapController`, mission/result Apis, editor, review, view — **not** `MissionMapWorkspace`.

**Hidden** Own LayerGroup (route + measurement sources for editor/review); view transitions.

**After successful finalize** Show fading advisory popup (mission UI): operator should refresh heatmap. Do **not** call HeatmapWorkflow. Do **not** import heatmap module.

---

### 9. NavigationWorkflow

**Responsibility** Administrative geography navigation state and its map layers.

**Hidden** Own LayerGroup (context / active / selection / hover), Select interaction, transition policy.

**Constructor** `MapController` + admin dataset (local) + location display — **not** `NavigationMapWorkspace`.

---

### 10. Admin reference data (navigation-owned)

**Responsibility** Load/index admin geography.

**Types** `AdminNode`, `AdminTree`, loader live with **navigation** workflow. Not a global `domain/` or `data/` dump unless a second consumer appears.

---

### 11. OperationsPanel

**Responsibility** Shell: workflows register views. Direction: stop growing as central domain callback hub.

---

### 12. CompositionRoot

**Responsibility** Construct once: map, Apis, renderer, workflows; register panel views; initial `load` / `showInitialRoot`.

**Must not** Build feature layers; hold `*MapWorkspace` objects; call heatmap from mission finalize path; select Mock vs Http for missions (Http only; require API base URL).

---

## Hierarchy principle (implemented)

```
apps/frontend/src/
  composition/           # CompositionRoot
  map/                   # MapController, basemap, shared view helpers
  ui/                    # Shared shell controls only (panel host, etc.)
  workflows/
    navigation/          # workflow, AdminNode/Tree, loader, nav UI
    mission/             # workflow, HttpMission(Result)Api, editor, review, mission UI
    heatmap/             # workflow, HttpSignalQualityApi, SignalQualityRenderer,
                         #   palette, legend, tile sources, worker
  ui.config.ts
```

Rule: **belong where used**. Shared folder only when two workflows need the same thing for the same reason. No global `data/`.

---

## Configuration ownership

| Slice | Owner |
| ----- | ----- |
| `kpiRenderer`, `workerPoolSize`, `tileSize`, `maxZoom` | `ui.config.ts` |
| Default palette | Signal Quality palette module (heatmap) |
| Grid size, tile path helper | `packages/contracts` |
| Server projection / cache / TTL | Backend `signal-quality.config.ts` |
| API base URL, DB URL | Environment |

---

## Backend (unchanged structure)

| Module | Responsibility | Public surface |
| ------ | -------------- | -------------- |
| MissionModule | Lifecycle, routes, dispatch, sweeper | HTTP |
| MissionResultModule | Upload, measurements, revisions, review | HTTP; export approved read; emit `ResultRevisionFinalized` |
| SignalQualityModule | Numeric projection | HTTP range + tiles; listen to finalize event |
| CommonModule | Prisma, ApiError, events | Infra exports |

Finalize remains HTTP. Domain event invalidates SQ server-side. **Client** auto-update is future SSE (`docs/future-features.md`), not a frontend cross-workflow call.

---

## Target dependency graph (frontend)

```
CompositionRoot
  ├── MapController
  ├── workflows/navigation  (Admin* + NavigationWorkflow)
  ├── workflows/mission
  │     ├── HttpMissionApi / HttpMissionResultApi
  │     ├── MissionEditor / MeasurementReview
  │     └── MissionWorkflow → MapController.map (own layers)
  └── workflows/heatmap
        ├── HttpSignalQualityApi ──┬──▶ HeatmapWorkflow (getRange)
        │                          └──▶ SignalQualityRenderer (getTile)
        └── HeatmapWorkflow → renderer.layer on map
```

**Forbidden**

- MissionWorkflow → HeatmapWorkflow  
- Workflow A → disable Workflow B  
- Tile source → HTTP without `SignalQualityApi`  
- MapController → feature layer setters  

---

## Scenarios (settled)

**Finalize result**  
MissionWorkflow → MissionResultApi → success → fading popup (“refresh heatmap”) → operator Refresh on heatmap → `getRange` + renderer range → tiles via `getTile`. Backend already invalidated projection.

**Palette change**  
HeatmapWorkflow → renderer + legend; no network.

**Enter route draw**  
MissionWorkflow + MissionEditor; map-shell interaction policy (R-07) prevents admin-select conflict — not `navigation.setSelectionEnabled(false)`.

**Second KPI later**  
New workflow + Api + renderer pattern; no generic KPI framework in this redesign. Optional rename SQ→Kpi only when a second indicator exists.

---

## Explicit non-goals (still out of scope)

- Implementing SSE or any live channel  
- Generic multi-KPI framework  
- `ExecutionAttempt` entity  
- LayerGroup registry on MapController  
- Deleting WebGL adapter  
- Frontend MockMissionApi (removed; do not restore)

---

## Implementation status

R-06..R-08 completed the ordered work: full `HttpSignalQualityApi`, `SignalQualityRenderer`, no cross-workflow finalize refresh (fading advisory only), MockMissionApi removed, workflow-owned layers, hierarchy under `workflows/`.
