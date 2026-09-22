# R-10 — Clean scripts, generated data, and developer tooling hierarchy

## Objective
Make data pipelines and developer scripts easy to discover and keep source/generated/runtime data distinct.

## Read
- `tools/`
- `apps/frontend/public/data/`
- `docs/architecture-target.md`
- current README/DOC

## Task
Define and implement a clean hierarchy separating:
- developer lifecycle tooling;
- database/seed tooling;
- data-pipeline source inputs;
- preprocessing/generation code;
- generated runtime datasets.

Do not duplicate datasets.

Update script paths and package scripts after moving files.

## Acceptance
A developer can answer “where is the source data?”, “where is generated runtime data?”, and “where is the script that generates it?” from the directory structure alone.

## Constraints
No tests. Do not alter generated data semantics unless required by the new organization.
