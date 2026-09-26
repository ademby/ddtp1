# Telecom Drone Drive-Test Platform

GIS frontend for planning and visualizing telecom drone drive-test missions.

## Validation

- `npm run check` validates the TypeScript graph.
- `npm test` runs focused workflow seam tests with Node's built-in test runner.
- `npm run build` validates the production bundle.

The application provides an interactive map for:

* Navigating Tunisian administrative boundaries
* Creating and editing drone mission trajectories
* Managing mission metadata and status
* Visualizing Signal Quality over the map
* Integrating the frontend with the backend and PostGIS

The frontend is built with **OpenLayers**, **TypeScript**, **Vite**, and vanilla web technologies.

---

## Overview

The application is divided into three main areas:

```text
Administrative Map
        │
        ├── Browse administrative hierarchy
        ├── Select regions
        └── Navigate through ADM0 → ADM3
       
Mission Editor
        │
        ├── Create LineString routes
        ├── Modify route vertices
        ├── Move routes
        ├── Undo / Redo
        └── Save / Cancel missions

KPI Visualization
        │
        ├── Signal Quality
        ├── Spatial interpolation
        └── Color-based visualization
```

The project is organized into focused modules so feature behavior, rendering,
and persistence remain independently maintainable.

---

# Tech Stack

* **TypeScript**
* **Vite**
* **OpenLayers**
* **GeoJSON**
* **PostgreSQL / PostGIS** for backend persistence
* **REST API** for frontend/backend communication

No frontend framework such as React is used.

---

# Project Structure

```text
apps/
├── backend/                   # NestJS mission API and Prisma adapter
├── drone-mock/                # drone integration simulator
└── frontend/                  # Vite/OpenLayers operator console
    ├── public/data/           # generated runtime datasets
    └── src/                   # frontend modules
        ├── composition/
        ├── workflows/
        ├── domain/
        ├── data/
        ├── map/
        ├── mission/
        ├── kpi/
        └── ui/

packages/
└── contracts/                 # shared frontend/backend mission types

tools/
├── clean.mjs, dev.mjs, test.mjs, watch-service.mjs  # lifecycle
├── db/                        # database pod + seed scripts
└── data-pipeline/
    ├── admin-boundaries/      # source input/, preprocess, reports/
    └── signal-quality/        # signal-quality dataset generator

apps/frontend/public/data/     # generated runtime datasets only

tests/                         # cross-application workflow and API tests
docs/                          # ADRs, specifications, and UML
```

The main principle is to keep **domain logic, map rendering, data access, and UI responsibilities separate**.

The repository is a three-application platform workspace. Frontend, backend,
and drone mock are independently buildable under `apps/`. Mission types live in
`packages/contracts` and are imported by both frontend and backend.

## Platform commands

```bash
npm run platform:check
npm run platform:test
npm run backend:build
npm run drone-mock:build
npm run backend:db:migrate -- --name init
```

---

# Application Architecture

The main composition root is:

```text
main.ts
   ↓
CompositionRoot
   ↓
┌─────────────────┬────────────────┬─────────────────┐
│                 │                │
Navigation      Mission         Heatmap
Workflow        Workflow        Workflow
│                 │                │
└─────────────────┴────────────────┘
                 ↓
            MapController
                 ↓
             OpenLayers
```

### CompositionRoot

`CompositionRoot` wires the application.

Workflows own application state and rules:

> What is the application currently doing?

The composition root should not contain feature logic or low-level OpenLayers rendering logic.

### MapController

`MapController` owns the OpenLayers map and handles map-related operations.

It answers:

> How should the current application state appear on the map?

### Domain

The domain layer represents concepts such as:

```text
AdminNode
AdminTree
Mission
```

These objects should not depend on UI components.

### Data adapters

Feature workflows depend on focused data interfaces. Current implementations
include the mission API in `packages/contracts`, the signal quality loader in
`kpi/SignalQualityService.ts`, and the administrative dataset loader in
`data/AdminDatasetLoader.ts`.

This keeps HTTP/data-access code away from the UI and map rendering.

---

# Administrative Boundaries

The application uses **geoBoundaries Tunisia** data.

The hierarchy is:

```text
ADM0
 └── ADM1
      └── ADM2
           └── ADM3
```

Runtime geometry is loaded from the simplified GeoJSON datasets.

Administrative relationships are determined during preprocessing rather than calculated repeatedly in the browser.

Each runtime administrative feature contains information such as:

```json
{
  "adminLevel": 2,
  "parentId": "..."
}
```

The runtime hierarchy is represented using pointers:

```text
AdminTree
   │
   └── AdminNode
        ├── parent
        ├── children
        └── feature
```

OpenLayers features are associated with their corresponding `AdminNode` using a `WeakMap`.

---

# Administrative Navigation

The map supports hierarchical navigation.

For example:

```text
Tunisia
   ↓
Tunis
   ↓
La Marsa
   ↓
Carthage
```

The selected region is displayed together with its surrounding context.

Ancestors remain visible as context, while the active frontier contains selectable regions.

The breadcrumb UI reflects the current administrative path.

---

# Mission Editor

A mission is currently represented by a simple `LineString`.

```text
Point 1 ─── Point 2 ─── Point 3 ─── Point 4
```

A mission also contains non-geometric information such as:

```text
name
mission time
status
```

Supported operations include:

```text
Create
Edit
Translate
Undo
Redo
Save
Cancel
Delete
```

Creating a mission starts with a `NOT_ACCOMPLISHED` status.

The mission editor uses OpenLayers interactions rather than implementing geometry editing from scratch:

```text
Draw
Modify
Translate
```

---

# Mission Data

The frontend uses a simple application-level representation.

Conceptually:

```json
{
  "id": 1,
  "name": "Tunis Drive Test",
  "status": "NOT_ACCOMPLISHED",
  "missionTime": "2026-08-30T10:00:00Z",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [10.18, 36.80],
      [10.19, 36.81],
      [10.20, 36.82]
    ]
  }
}
```

The geometry is represented using standard GeoJSON.

This allows the backend to use PostGIS internally while keeping the frontend API simple.

---

# KPI Visualization

The platform currently focuses on one metric:

**Signal Quality**

The intended visualization is a continuous interpolated surface.

```text
Bad                                 Good
Dark Red → Red → Orange → Yellow → Cyan → Light Blue
```

The objective is not to reproduce a conventional earthquake-style heatmap.

Instead:

```text
measurement points
        ↓
spatial interpolation
        ↓
continuous Signal Quality field
        ↓
color rendering
        ↓
map
```

The map itself displays the color field and a legend indicating the value range.

The interpolation mechanism is kept separate from OpenLayers rendering so that it can later be replaced or moved to the backend.

---

# Data Flow

The intended production architecture is:

```text
PostgreSQL + PostGIS
        ↓
     REST API
        ↓
   Frontend services
        ↓
 Application controllers
        ↓
     OpenLayers
```

As the amount of measurement data grows, the system can later move toward:

```text
GeoJSON
   ↓
BBOX / spatial queries
   ↓
Vector Tiles / MVT
   ↓
WebGL rendering
```

while preserving the application architecture.

---

# Running the Project

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open the URL displayed by Vite, usually:

```text
http://localhost:5173
```

Build the application:

```bash
npm run build
```

---

# Backend Configuration

The frontend is designed to work with a REST backend.

A backend base URL can be configured through the Vite environment configuration.

For example:

```env
VITE_API_BASE_URL=http://localhost:3000
```

The local mission adapter remains available for offline frontend development.

---

# Development Principles

A few principles are important when extending the project.

### Keep OpenLayers out of domain logic

Prefer:

```text
MissionController
    ↓
Mission
```

instead of:

```text
Mission
    ↓
OpenLayers Feature
```

The OpenLayers feature is a rendering representation, not the domain object itself.

### Keep UI components focused

A control such as:

```text
Breadcrumbs
BasemapControl
OperationsPanel
```

should manage its UI and emit/receive application state rather than implementing navigation or business logic.

### Keep rendering separate from decisions

The application decides:

```text
what should be displayed
```

and `MapController` decides:

```text
how it is rendered
```

### Prefer simple solutions

Avoid introducing additional frameworks or abstractions unless they solve a real problem.

---

# Future Evolution

The current architecture is intentionally prepared for future additions such as:

```text
Real drone missions
        ↓
GPS flight tracks
        ↓
Large measurement datasets
        ↓
Multiple telecom metrics
        ↓
Server-side interpolation
        ↓
PostGIS spatial queries
        ↓
Vector tiles / WebGL
        ↓
Real-time mission monitoring
```

The goal is to add these capabilities incrementally without coupling them to the existing administrative-map implementation.

---

# For New Contributors

A good starting point is:

```text
1. apps/frontend/src/main.ts
2. CompositionRoot
3. MapController
4. AdminTree / AdminNode
5. MissionWorkflow
6. HeatmapWorkflow
```

Before changing map behavior, understand the distinction between:

```text
Domain
  ↓
Application logic
  ↓
Map rendering
  ↓
UI
```

This separation is the main architectural principle of the project.
