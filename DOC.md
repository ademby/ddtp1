# Telecom Drone Drive-Test Platform

Operator console and backend for planning and executing telecom drone drive-test missions, validating results, and exploring geographic Signal Quality projections.

## Validation

- `npm run check` validates the TypeScript graph.
- `npm test` runs focused workflow seam tests with Node's built-in test runner (tests are out of scope for the redesign phase).
- `npm run build` validates the production bundle.

The platform provides:

* Hierarchical navigation of administrative boundaries
* Creating and editing drone mission routes (route revisions)
* Mission lifecycle (plan, dispatch, claim, status, result upload)
* Operator validation of immutable result revisions
* Signal Quality numeric-tile visualization with client-side palette

Frontend: **OpenLayers**, **TypeScript**, **Vite**. Backend: **NestJS**, **Prisma**, **PostgreSQL/PostGIS**.

---

## Overview

Three operator-facing workflows share a thin map shell:

```text
NavigationWorkflow    MissionWorkflow    HeatmapWorkflow
        │                    │                    │
        └────────────────────┴────────────────────┘
                             │
                       MapController
                       (map, basemap, view helpers)
```

Each workflow owns its application state, map layers, feature UI, and HTTP adapters.

---

## Tech stack

* TypeScript, Vite, OpenLayers (frontend)
* NestJS, Prisma, PostgreSQL / PostGIS (backend)
* Shared contracts in `packages/contracts`
* REST for browser ↔ backend and drone ↔ backend

No React or similar UI framework.

---

## Project structure

```text
apps/
├── backend/                   # NestJS feature modules (mission, mission-result, signal-quality)
├── drone-mock/                # drone integration simulator
└── frontend/                  # Vite/OpenLayers operator console
    ├── public/data/           # generated runtime datasets only
    └── src/
        ├── composition/       # CompositionRoot
        ├── map/               # MapController, basemap, view helpers
        ├── ui/                # OperationsPanel host
        ├── workflows/
        │   ├── navigation/    # admin tree, breadcrumbs, location search
        │   ├── mission/       # missions, editor, review, HttpMission(Result)Api
        │   └── heatmap/       # Signal Quality renderer, tiles, palette, legend
        └── ui.config.ts

packages/
└── contracts/                 # shared API/domain wire types

tools/
├── clean.mjs, dev.mjs, test.mjs, watch-service.mjs
├── db/                        # database pod + seed scripts
└── data-pipeline/
    ├── admin-boundaries/      # source input/, preprocess, reports/
    └── signal-quality/        # dataset generator

tests/                         # cross-application tests (out of redesign scope)
docs/                          # ADRs, architecture, UML, tasks
```

Principle: **workflows own features**; MapController is a shared shell; contracts cross the HTTP boundary only.

---

## Application architecture

```text
main.ts
   ↓
CompositionRoot
   ↓
┌─────────────────┬────────────────┬─────────────────┐
│ Navigation      │ Mission        │ Heatmap         │
│ Workflow        │ Workflow       │ Workflow        │
└────────┬────────┴────────┬───────┴────────┬────────┘
         │                 │                │
         └─────────────────┴────────────────┘
                           ↓
                     MapController
                           ↓
                      OpenLayers
```

### CompositionRoot

Constructs map, HTTP APIs, `SignalQualityRenderer`, and workflows once; registers panel views; runs initial load. Does not build feature layers or call Heatmap from Mission finalize.

### MapController

Owns the OL `Map`, basemap switching, and shared view-animation helpers (`fitViewToFeature`, `hopToView`, …). Does **not** own feature layers or workflow UI.

### Workflows

* **NavigationWorkflow** — admin geography state and layers.
* **MissionWorkflow** — mission list/edit/plan/review; owns route and measurement layers; after finalize shows a fading advisory to refresh the heatmap (does not call HeatmapWorkflow).
* **HeatmapWorkflow** — Signal Quality visibility, palette, range load/refresh; owns the tile layer via `SignalQualityRenderer`.

### HTTP adapters

`HttpMissionApi`, `HttpMissionResultApi`, `HttpSignalQualityApi` implement contracts from `packages/contracts`. `VITE_API_BASE_URL` is required; there is no frontend MockMissionApi.

---

## Administrative boundaries

geoBoundaries Tunisia hierarchy: ADM0 → ADM1 → ADM2 → ADM3.

Runtime geometry comes from simplified GeoJSON under `apps/frontend/public/data/`. Hierarchy is precomputed; browser uses `AdminTree` / `AdminNode` (owned by the navigation workflow).

---

## Missions

Missions are **route-centric**. A mission owns immutable **route revisions**; editing creates a new revision. Execution is implicit (no first-class `ExecutionAttempt`). Lifecycle includes draft, planned, dispatched, running, completed, failed, cancelled. Missed dispatch is a terminal failure when the deadline passes before claim.

Coordinates on the API are GeoJSON WGS84; OpenLayers transforms to the map projection.

---

## Results and measurements

A **Measurement** is an immutable raw observation (no derived KPI values). A **MissionResult** is the uploaded dataset for one execution. Operator validation produces immutable **ResultRevision**s; corrections create a new revision. Exactly one finalized revision is authoritative. KPI projections use that revision only.

---

## Signal Quality (KPI)

**KPI** is the generic term; **Signal Quality** is the concrete feature.

Backend serves **numeric data tiles** and range/version metadata. Presentation (palette, opacity, thresholds) is client-side (`ui.config.ts`, `SignalQualityPalette`). Canvas-worker path is the default renderer; WebGL adapter is retained (ADR-0006). Tile sources use `SignalQualityApi.getTile` only.

---

## Configuration ownership

| Concern | Owner |
| ------- | ----- |
| `kpiRenderer`, `workerPoolSize`, tile display knobs | `apps/frontend/src/ui.config.ts` |
| Default palette | `workflows/heatmap/SignalQualityPalette` |
| Grid size / tile path | `packages/contracts` |
| Interpolation radii, TTL, server tile cache | `apps/backend/src/signal-quality/signal-quality.config.ts` |
| API base URL, DB URL | Environment |

---

## Running the project

```bash
npm install
npm run db:up
npm run dev
```

Frontend: `http://localhost:5173` · Backend: `http://localhost:3000` · Drone mock: `http://localhost:3001`

Frontend requires `VITE_API_BASE_URL` (see `apps/frontend/.env.example`).

---

## Development principles

* Keep OpenLayers out of domain/workflow decision types.
* Workflows decide *what* is shown; MapController provides the shared map surface.
* Prefer small public interfaces and hidden implementation (deep modules).
* Do not introduce cross-workflow calls for live updates (future SSE is documented separately).

---

## For new contributors

1. `apps/frontend/src/main.ts`
2. `CompositionRoot`
3. `MapController`
4. `workflows/navigation` (`AdminTree` / `AdminNode`)
5. `workflows/mission` (`MissionWorkflow`)
6. `workflows/heatmap` (`HeatmapWorkflow`, `SignalQualityRenderer`)

Read `CONTEXT.md`, `docs/architecture-target.md`, and accepted ADRs before changing boundaries.
