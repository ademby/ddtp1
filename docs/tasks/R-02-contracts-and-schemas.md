# R-02 — Redesign contracts and schemas

## Objective
Make cross-boundary contracts deliberate and consistent with the current domain decisions.

## Read
- `docs/architecture-target.md`
- `CONTEXT.md`
- `packages/contracts/src/*.ts`
- backend DTOs/controllers/services
- `apps/backend/prisma/schema.prisma`
- relevant frontend data adapters

## Important domain rules
- Measurements are immutable raw observations.
- Derived KPI values are not part of the Measurement domain concept.
- Result revisions are immutable.
- Exactly one finalized result revision is authoritative.
- Signal Quality is the concrete KPI; generic KPI abstractions stay small.
- Numeric tiles contain numeric data, not presentation colors.

## Task
Redesign shared contracts and transport DTOs where necessary. Separate:
1. cross-application wire contracts;
2. domain-owned types;
3. implementation-private types.

Do not create a global type dump.

For each changed contract, ensure frontend and backend usage remain explicit and type-safe. Keep the numeric-tile contract stable in principle: numeric values cross the boundary, presentation stays client-side.

## Acceptance
- Contracts express the current domain decisions.
- No transport DTO leaks OpenLayers/Prisma implementation types.
- Backend and frontend compile against the new contracts.
- No unnecessary generic KPI hierarchy is introduced.

## Constraints
No tests. Do not redesign persistence here beyond changes strictly required by the contract model.
