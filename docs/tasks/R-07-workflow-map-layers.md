# R-07 — Make workflows own their map layers/groups

## Objective
Finish ADR-0005 in code.

## Read
- `docs/adr/0005-workflow-owned-map-surface-and-ui.md`
- `docs/architecture-target.md`
- `docs/deep-modules-proposal.md`
- `apps/frontend/src/workflows/`
- `apps/frontend/src/map/MapController.ts`
- `apps/frontend/src/composition/CompositionRoot.ts`

## Task
Refactor the frontend so each workflow owns its own map `LayerGroup` and workflow-local map interactions/UI registration where the ADR requires it.

Target:
- `NavigationWorkflow`
- `MissionWorkflow`
- `HeatmapWorkflow`

Shrink `MapController` to genuinely shared map mechanics. Remove bespoke `*MapWorkspace` pass-through seams where they only forward calls.

Do not move domain logic into OpenLayers code.

## Acceptance
- `CompositionRoot` only composes dependencies.
- Each workflow owns the layers/interactions belonging to it.
- `MapController` does not grow feature-specific setters.
- No dead commented-out WebGL block remains in `MapController`.
- Behavior remains equivalent.

## Constraints
No tests. Keep the existing Canvas/WebGL renderer decision from ADR-0006.
