# R-12 — Final integration and prototype-to-product cleanup

## Objective
Perform the final architectural cleanup after all redesign tickets.

## Read
- `TODO.md`
- `docs/architecture-target.md`
- `docs/deep-modules-proposal.md`
- all changed areas from R-01..R-11

## Task
Review the resulting repository for:
- dead code;
- unused imports;
- duplicate configuration;
- accidental pass-through interfaces;
- dependency-direction violations;
- stale comments/docs;
- prototype-only code that no longer has a purpose;
- inconsistent naming between Signal Quality/KPI/Projection/Result;
- scripts pointing to moved files.

Fix only issues introduced or exposed by this redesign.

## Explicitly do not
- add tests;
- introduce authentication;
- introduce a first-class ExecutionAttempt;
- add a generic KPI persistence hierarchy;
- add frameworks;
- perform speculative performance work.

## Acceptance
The repository reads as a coherent product architecture rather than a prototype incrementally patched in place. Update `TODO.md` to mark completed tickets.
