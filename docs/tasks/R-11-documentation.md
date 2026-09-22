# R-11 — Reconcile documentation and UML

## Objective
Make architecture documentation describe the implementation that now exists.

## Read
- all current ADRs
- `CONTEXT.md`
- `README.md`
- `DOC.md`
- `docs/architecture-target.md`
- `docs/deep-modules-proposal.md`
- current UML files

## Task
Update documentation/UML only where implementation decisions changed during R-01..R-10.

Specifically ensure:
- terminology matches the current domain decisions;
- workflow/layer ownership matches code;
- configuration ownership is documented;
- deep modules and dependency direction are documented;
- KPI numeric-tile/rendering architecture matches implementation;
- folder structure examples are current.

Do not rewrite documentation for style alone.

## Acceptance
No accepted ADR materially contradicts the implementation. Remove obsolete descriptions rather than layering corrections on top of them.
