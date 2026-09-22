# R-04 — Introduce responsibility-based configuration

## Objective
Create a clear configuration model for tunable behavior instead of scattered constants.

## Read
- `docs/architecture-target.md`
- frontend KPI/tile/rendering code
- backend Signal Quality tile code
- root and workspace package manifests
- `.env.example` files

## Required configuration categories
Use separate ownership by responsibility, not one giant global config object. At minimum evaluate:
- application/domain defaults;
- projection/data parameters;
- frontend rendering/UI parameters;
- infrastructure/runtime settings.

Concrete current examples include:
- Signal Quality grid size (backend + frontend contract);
- frontend tile/rendering size;
- worker pool size;
- KPI renderer selection;
- palette/rendering defaults.

## Task
Design and implement a small typed configuration layer. Environment variables remain appropriate for runtime/infrastructure values; source configuration is appropriate for product/rendering defaults.

Configuration must have one obvious owner and no duplicated magic constants.

## Acceptance
- Existing tunables can be changed from their configuration location.
- Backend/frontend do not silently disagree on shared protocol values.
- Configuration ownership is documented.
- No unrelated framework/config library is introduced.

## Constraints
No tests. Keep the configuration API small.
