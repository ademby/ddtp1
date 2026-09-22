# R-09 — Stabilize and configure Signal Quality numeric tiles/rendering

## Objective
Turn the current Signal Quality rendering prototype into a deliberate configurable implementation without degrading its current visual behavior.

## Read
- `docs/adr/0004-numeric-map-data-tiles.md`
- `docs/adr/0006-dual-kpi-renderer-adapters-retained.md`
- `docs/deep-modules-proposal.md`
- R-04 configuration
- all files under the current KPI module

## Task
Consolidate:
- numeric tile grid size;
- frontend tile/render size;
- renderer selection;
- worker pool size;
- palette defaults;
- value-range handling;
- no-data behavior.

Preserve floating-point numeric ranges. Do not integer-cast KPI values.

Keep both renderer adapters behind the single renderer interface as documented. Canvas remains the operator-ready default unless the current ADR/config says otherwise.

Do not reintroduce WebGL-specific behavior into generic map code.

## Acceptance
- Changing palette does not require refetching numeric data.
- Numeric tiles remain numeric and version-cacheable.
- Rendering configuration is centralized.
- Existing natural/non-pixellated visual intent is preserved.
- No unused helper functions or dead rendering paths are introduced.

## Constraints
No tests. Do not perform broad performance benchmarking; make targeted architectural changes only.
