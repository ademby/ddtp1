# R-03 — Align backend domain and persistence with the contracts

## Objective
Bring NestJS domain/application/persistence code into alignment with R-02.

## Read
- `docs/architecture-target.md`
- `packages/contracts/`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/mission/`
- `apps/backend/src/mission-result/`
- `apps/backend/src/signal-quality/`
- `apps/backend/src/common/`

## Task
Implement only the backend changes required by the redesigned contracts and domain rules.

Preserve:
- backend control authority;
- immutable route revisions;
- immutable finalized result revisions;
- event-based result-finalization → Signal Quality invalidation;
- current execution model (do not introduce `ExecutionAttempt` as a first-class entity);
- current feature-module split.

If persistence changes are necessary, make them explicit and migration-safe.

## Acceptance
Backend source reflects the contract/domain ownership established in R-02 without introducing unrelated abstractions.

## Constraints
No tests. Do not add authentication, fleet management, telemetry, or other out-of-scope product features.
