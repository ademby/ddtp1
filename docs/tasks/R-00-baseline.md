# R-00 — Baseline and working constraints

## Objective
Establish the exact redesign baseline before changing code.

## Read
- `CONTEXT.md`
- `docs/design-decisions-2026-09-22.md`
- `docs/adr/0001-platform-boundary-and-contexts.md`
- `docs/adr/0002-immutable-results-and-derived-projections.md`
- `docs/adr/0005-workflow-owned-map-surface-and-ui.md`
- `docs/adr/0006-dual-kpi-renderer-adapters-retained.md`
- `docs/adr/0007-backend-feature-modules.md`
- `docs/adr/0008-operational-workflow-and-kpi-terminology.md`
- `README.md`
- current `TODO.md`

## Context
The repository has moved from a prototype toward a product architecture. Several architectural decisions are already accepted, but code and documentation are not fully synchronized.

## Task
Perform a lightweight structural inventory only. Do not redesign or refactor code.

Record:
- current application/workspace boundaries;
- current contract boundaries;
- backend feature-module boundaries;
- frontend workflow/module boundaries;
- current configuration locations (if any);
- current data/script locations;
- known mismatches between accepted ADRs and implementation.

## Output
Update `TODO.md` only if the baseline reveals a missing redesign ticket. Otherwise leave implementation untouched.

## Constraints
- No tests.
- No broad code reading.
- No implementation changes.
