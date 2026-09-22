# R-08 — Refactor frontend hierarchy around feature ownership

## Objective
Make the frontend folder hierarchy reflect the actual product boundaries after R-06/R-07.

## Read
- `docs/architecture-target.md`
- `docs/deep-modules-proposal.md`
- `apps/frontend/src/`

## Task
Reorganize files into a hierarchy that groups cohesive feature/application modules without creating excessive nesting.

Evaluate:
- navigation/admin geography;
- missions/results/review;
- Signal Quality/KPI;
- map infrastructure;
- UI infrastructure/shared views;
- composition/bootstrap;
- data adapters.

Move files and update imports. Do not rename concepts merely for cosmetic consistency.

## Acceptance
A new agent can locate a feature's application logic, rendering adapter, data adapter, and UI without scanning unrelated feature directories.

## Constraints
No tests. Do not introduce a frontend framework.
