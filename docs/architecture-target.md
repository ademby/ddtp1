# Architecture target

This document is the authoritative baseline for all subsequent implementation tickets. It describes the intended steady-state shape; current code may diverge — that divergence is what the later tickets must close.

---

## Boundaries

Three explicit boundaries, each with its own deployment concern:

```
┌───────────────────────────────────────────────────────────┐
│  Browser (frontend)                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Navigation  │  │   Mission    │  │    Heatmap      │  │
│  │  Workflow   │  │   Workflow   │  │    Workflow     │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                │                    │            │
│         └────────────────┴──────────┬─────────┘            │
│                               MapController                │
│                            (OL Map, basemap,               │
│                             shared view helpers)           │
└───────────────────────────────────────┬───────────────────┘
                                        │  HTTP / REST
┌───────────────────────────────────────▼───────────────────┐
│  NestJS backend                                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │  Mission     │  │  MissionResult   │  │ SignalQuality│  │
│  │  Module      │  │  Module          │  │ Module      │  │
│  └──────────────┘  └──────────────────┘  └─────────────┘  │
│                          ↓ event                           │
│                 ResultRevisionFinalized                     │
└───────────────────────────────────────────────────────────┘
                                        │  REST polling/upload
┌───────────────────────────────────────▼───────────────────┐
│  Drone (external, integration concern only)                │
└───────────────────────────────────────────────────────────┘
```

---

## Dependency direction

### Backend

```
SignalQualityModule  ──imports──▶  MissionResultModule (read approved measurements)
MissionResultModule  ──emits──▶   ResultRevisionFinalized event
SignalQualityModule  ──listens──▶ ResultRevisionFinalized event
MissionModule        ◀── no dependency on MissionResultModule or SignalQualityModule
CommonModule         ◀── imported by all three feature modules
```

The `mission-result → signal-quality` direct call is gone (replaced by event). The `signal-quality → mission-result` import remains the one legitimate read edge. `MissionDispatchSweeper` belongs in `MissionModule`.

### Frontend

```
CompositionRoot  builds  MapController
CompositionRoot  builds  each Workflow, passing MapController directly
Workflows        own     their LayerGroup(s) — add/remove via mapController.map
Workflows        own     their UI controls — add via mapController.map.addControl
MapController    does not  know individual workflows exist
```

---

## Ownership of state

| State | Owner |
|---|---|
| Mission list, selected mission, edit mode | `MissionWorkflow` |
| Heatmap visibility, loaded dataset, palette | `HeatmapWorkflow` |
| Admin navigation tree, selected node, path | `NavigationWorkflow` |
| OL `Map` instance, basemap, view animations | `MapController` |
| Raw approved measurements (server-side) | `MissionResultModule` |
| Signal Quality tile version/range | `SignalQualityModule` |
| KPI palette (client presentation) | `HeatmapWorkflow` — never sent to backend |

---

## Ownership of map layers and layer groups

**Target (ADR-0005):** each workflow constructs and owns its own `LayerGroup` and registers it with `mapController.map.addLayer(layerGroup)`. The workflow is responsible for its own layer lifecycle.

**Current gap:** `MapController` still directly owns named sources and layers (`missionSource`, `measurementSource`, `missionLayer`, `measurementLayer`, `kpiLayer`, `contextLayer`, `activeLayer`, etc.) and exposes them as public fields. `CompositionRoot` wires these into the workflow `mapWorkspace` adapters. This is the `*MapWorkspace` seam the ADR intends to eliminate.

**Target shape:**

- `NavigationWorkflow` owns: context/active/selection/hover layers and the `Select` interaction.
- `MissionWorkflow` owns: mission route layer, measurement layer, and the `MissionEditor` interactions.
- `HeatmapWorkflow` owns: KPI tile layer (`TileLayer` or `WebGLTileLayer`), KPI renderer, legend control.
- `MapController` retains: OL `Map`, `BasemapManager`, `fitViewToFeature`, `fitViewToFeatureHop`, `hopToView`, and basemap control registration.

Until those tickets run, the `*MapWorkspace` adapter objects in `CompositionRoot` remain the working shim. Do not remove them before the corresponding ownership-transfer ticket lands.

---

## Contract vs domain types

| Layer | What lives here |
|---|---|
| `packages/contracts/` | Cross-boundary API shapes: request/response DTOs, IDs, enum literals. These are the only types shared between frontend and backend. |
| Backend feature module internals | Domain entities (Prisma-backed), service types, event payloads — never exported across the module boundary. |
| Frontend workflow internals | `*MapWorkspace`, `*DataSource`, `*Renderer` interfaces — private to the workflow file unless another workflow explicitly depends on them. |
| Frontend `domain/` | Client-side value objects (`AdminNode`, ID wrappers) independent of any framework. |

OpenLayers types must not leak into workflow interface signatures. Backend Prisma types must not leak outside the repository class that owns them.

---

## Configuration responsibilities

| Concern | Owner | Location |
|---|---|---|
| KPI renderer selection (`canvas` / `webgl`) | Frontend build config | `ui.config.ts` — `kpiRenderer: 'canvas' \| 'webgl'` |
| Canvas worker pool size | Frontend build config | `ui.config.ts` — `workerPoolSize: number` (default 1) |
| API base URL | Runtime env | `VITE_API_BASE_URL` |
| Tile cache parameters, interpolation | Backend domain config | `SignalQualityModule` internals |
| Feature flags, domain defaults | Backend application config | per-module, not global |

There is no global configuration object. Each responsible party reads only the slice it owns.

---

## Deep-module expectations

Modules should hide implementation complexity and expose small interfaces.

**Backend:** A feature module's public surface is its `@Module` exports and event payloads. Controllers, services, repositories, and entity types are module-private unless explicitly exported. `ApiError` (in `common/`) is the only cross-module exception type.

**Frontend workflows:** A workflow's public interface is its constructor options type plus a small set of imperative methods (e.g. `load()`, `select()`, `toggle()`). Internal event subscriptions, layer management, and OL interactions are hidden. The `*MapWorkspace` adapter objects in `CompositionRoot` are temporary shims, not the intended public API of `MapController`.

---

## KPI rendering seam (ADR-0006)

Two concrete adapters exist behind a single `KpiRenderer`-shaped interface:

```
HeatmapWorkflow
  └── renderer: HeatmapRenderer
        ├── SignalQualityVisualizer        (Canvas/worker path, current default)
        └── SignalQualityVisualizer_ForWebGL  (WebGL path, retained for future use)
```

Selection is static: `ui.config.ts` `kpiRenderer` flag. There is no runtime toggle exposed to the operator — WebGL output quality is not operator-ready.

The `workerPoolSize` knob in `ui.config.ts` is the planned seam for round-robin worker-pool colorization on the Canvas path.

**The WebGL adapter is intentionally retained.** Do not delete it as dead code. The Canvas adapter is the live default.

---

## Execution and result model

- `ExecutionAttempt` is **not** a first-class entity. Execution is implicit in the mission/result relationship.
- A failed mission produces a new derived mission; it is not retried in place.
- `Measurement` is immutable and contains raw observations only. Derived KPI values are not stored on it.
- A `ResultRevision` is immutable once finalized. Corrections create a new revision. Exactly one finalized revision is authoritative at a time.
- KPI projections are only available after result finalization.

---

## Terminology reminder

- **KPI** — generic architectural term for any key performance indicator.
- **SignalQuality** — the concrete KPI currently implemented. Use this name for the feature, not `KPI`.
- **Data tile** — carries numeric values, not presentation colors (ADR-0004).
- **Projection** — server-side reproducible derived view; never mutated.
- **Palette** — client-side presentation concern; never sent to the backend.
