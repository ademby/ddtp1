# R-06 — Implement the approved deep-module design

## Objective
Implement the deep-module proposal from R-05 with minimal, meaningful interfaces.

## Read
- `docs/deep-modules-proposal.md`
- `docs/architecture-target.md`
- current modules named by the proposal

## Task
Implement the proposal. Preserve existing product behavior.

Priorities:
- hide OpenLayers complexity behind map/rendering modules;
- hide data-fetching/transport details behind feature services;
- keep workflows focused on application decisions rather than rendering mechanics;
- avoid pass-through interfaces;
- keep domain objects independent of OpenLayers and Prisma.

Where a module has only one method and no hidden complexity, do not force an abstraction.

## Acceptance
Every new interface has a concrete reason and hides meaningful implementation detail. Callers should become simpler, not merely more indirect.

## Constraints
No tests. Do not change user-visible behavior unless required to correct an architectural inconsistency.
