# R-01 — Reconcile architecture decisions with implementation

## Objective
Create one coherent architecture baseline that later agents can safely implement against.

## Read
- `CONTEXT.md`
- `docs/design-decisions-2026-09-22.md`
- all files under `docs/adr/`
- `apps/backend/src/app.module.ts`
- backend feature directories
- `apps/frontend/src/composition/CompositionRoot.ts`
- `apps/frontend/src/workflows/`
- `apps/frontend/src/map/MapController.ts`

## Key observations
The backend feature-module split is already implemented. The frontend ADR says workflows own their own map `LayerGroup`s, but current workflow code still exposes `*MapWorkspace` seams. Treat this as an implementation gap, not a reason to rewrite the ADR.

## Task
Produce a concise architecture target in `docs/architecture-target.md` covering:
- boundaries;
- dependency direction;
- ownership of state;
- ownership of map layers/groups;
- contract vs domain types;
- configuration responsibilities;
- deep-module expectations;
- KPI rendering seam.

Do not implement the redesign in this ticket.

## Acceptance
A fresh agent can read the target document and understand what the later tickets are expected to converge toward.

## Constraints
No tests and no speculative abstractions.
