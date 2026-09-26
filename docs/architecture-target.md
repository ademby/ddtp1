# Architecture (current)

Authoritative description of the implemented architecture after R-01..R-10. Matches code and accepted ADRs.

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

`MissionResultModule` does not call Signal Quality directly; it emits `ResultRevisionFinalized`. Signal Quality invalidates its projection on that event. The only remaining cross-feature import is `signal-quality → mission-result` for reading approved measurements.

### Frontend

```
CompositionRoot  builds  MapController
CompositionRoot  builds  each Workflow, passing MapController directly
Workflows        own     their layers — add/remove via mapController.map
Workflows        own     their UI controls — add via mapController.map.addControl
MapController    does not  know individual workflows exist
```

There are no `*MapWorkspace` pass-through adapters. Workflows never call each other (e.g. Mission finalize does not refresh Heatmap; a fading advisory prompts the operator).

---

## Ownership of state

| State                                       | Owner                                     |
| ------------------------------------------- | ----------------------------------------- |
| Mission list, selected mission, edit mode   | `MissionWorkflow`                         |
| Heatmap visibility, loaded dataset, palette | `HeatmapWorkflow`                         |
| Admin navigation tree, selected node, path  | `NavigationWorkflow`                      |
| OL `Map` instance, basemap, view animations | `MapController`                           |
| Raw approved measurements (server-side)     | `MissionResultModule`                     |
| Signal Quality tile version/range           | `SignalQualityModule`                     |
| KPI palette (client presentation)           | `HeatmapWorkflow` — never sent to backend |

---

## Ownership of map layers

Each workflow constructs and owns its layers and registers them with `mapController.map` (ADR-0005).

- `NavigationWorkflow` owns: context/active/selection/hover layers and the `Select` interaction.
- `MissionWorkflow` owns: mission route layer, measurement layer, and the `MissionEditor` / `MeasurementReview` interactions.
- `HeatmapWorkflow` owns: Signal Quality tile layer (`TileLayer` or `WebGLTileLayer` via `SignalQualityRenderer`), legend control.
- `MapController` retains: OL `Map`, `BasemapManager`, `fitViewToFeature`, `fitViewToFeatureHop`, `hopToView`, and basemap control registration.

---

## Frontend layout

```
apps/frontend/src/
  composition/           # CompositionRoot
  map/                   # MapController, basemap, shared view helpers
  ui/                    # Shared shell only (OperationsPanel host)
  workflows/
    navigation/          # NavigationWorkflow, AdminNode/Tree, loader, nav UI
    mission/             # MissionWorkflow, HttpMission(Result)Api, editor, review, UI
    heatmap/             # HeatmapWorkflow, HttpSignalQualityApi, SignalQualityRenderer,
                         #   palette, legend, tile sources (Canvas + WebGL), worker
  ui.config.ts           # Frontend product/rendering defaults
```

Admin types live under navigation. No global `domain/` or `data/` dump. HTTP adapters implement contracts from `packages/contracts` (`Http*Api`).

---

## Contract vs domain types

| Layer                            | What lives here                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/`            | Cross-boundary API shapes: request/response DTOs, IDs, enum literals, `SIGNAL_QUALITY_GRID_SIZE`. Shared by frontend and backend. |
| Backend feature module internals | Domain entities (Prisma-backed), service types, event payloads — not exported across the module boundary.                         |
| Frontend workflow internals      | Renderer interfaces, editors, review, local UI — private to the owning workflow unless another workflow depends on them.            |

OpenLayers types must not leak into workflow public interfaces. Backend Prisma types must not leak outside the repository that owns them.

---

## Configuration responsibilities

| Concern                                      | Owner                     | Location                                                                   |
| -------------------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| KPI renderer selection (`canvas` / `webgl`)  | Frontend product defaults | `apps/frontend/src/ui.config.ts` — `kpiRenderer`                           |
| Canvas worker pool size (planned seam)       | Frontend product defaults | `apps/frontend/src/ui.config.ts` — `workerPoolSize`                        |
| Display tile size / max zoom / opacity       | Frontend product defaults | `apps/frontend/src/ui.config.ts`                                           |
| Default palette                              | Heatmap presentation      | `workflows/heatmap/SignalQualityPalette.ts`                                |
| Numeric grid resolution (protocol)           | Shared contracts          | `packages/contracts` — `SIGNAL_QUALITY_GRID_SIZE`                          |
| Projection radii, points TTL, tile cache cap | Backend domain config     | `apps/backend/src/signal-quality/signal-quality.config.ts`                 |
| API base URL, database URL                   | Runtime env               | `VITE_API_BASE_URL` (required), `DATABASE_URL`                             |

No global configuration bag. Each owner reads only its slice. `VITE_API_BASE_URL` is required; frontend MockMissionApi has been removed.

---

## Deep-module expectations

Modules hide implementation complexity and expose small interfaces.

**Backend:** A feature module's public surface is its `@Module` exports and event payloads. Controllers, services, repositories, and entity types are module-private unless explicitly exported. `ApiError` (in `common/`) is the only cross-module exception type.

**Frontend workflows:** A workflow's public interface is its constructor options type plus a small set of imperative methods (e.g. `load()`, `select()`, `toggle()`). Internal event subscriptions, layer management, and OL interactions are hidden.

---

## KPI rendering seam (ADR-0006)

Two concrete adapters behind `SignalQualityRenderer`:

```
HeatmapWorkflow
  └── renderer: SignalQualityRenderer (HttpSignalQualityRenderer)
        ├── SignalQualityTileSource (Canvas/worker path, current default)
        └── SignalQualityTileSource_ForWebGL (WebGL path, retained)
```

Selection is static: `ui.config.ts` `kpiRenderer` flag. No operator-facing runtime toggle. WebGL is retained intentionally; Canvas is the live default. `workerPoolSize` is the planned seam for round-robin Canvas colorization.

Tiles carry **numeric values only** (ADR-0004). Palette/colorization is client-side. Tile sources call `SignalQualityApi.getTile` — never raw `fetch` against `apiBaseUrl`.

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
