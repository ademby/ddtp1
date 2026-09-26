# Redesign TODO

This is the ordered implementation backlog for transforming the current prototype into the final product architecture.

**Execution rule:** complete tickets in order unless a ticket explicitly says otherwise. Each ticket is intended to be handed to a fresh implementation agent with only the ticket and the referenced files/docs in context.

**Testing:** tests are intentionally out of scope for this redesign phase. Do not add, repair, or expand tests unless a later ticket explicitly changes this decision.

## Status

- [x] Existing domain/architecture decisions reviewed
- [x] Existing backend feature-module split established
- [x] Existing immutable-result and numeric-tile directions established
- [ ] Redesign execution

## Ordered tickets

| ID | Status | Area | Depends on |
|---|---|---|---|
| R-00 | [ ] | Baseline + working constraints | — |
| R-01 | [x] | Architecture reconciliation / source of truth | R-00 |
| R-02 | [x] | Contracts and schemas redesign | R-01 |
| R-03 | [x] | Backend domain/persistence alignment | R-02 |
| R-04 | [x] | Configuration architecture | R-01 |
| R-05 | [x] | Deep-module architecture proposal (Matt/architecture agent) | R-01, R-02, R-04 |
| R-06 | [x] | Deep-module implementation | R-05 |
| R-07 | [x] | Frontend workflow/map-layer ownership refactor | R-01, R-06 |
| R-08 | [x] | Frontend feature-module/folder hierarchy | R-06, R-07 |
| R-09 | [x] | KPI numeric-tile configuration + rendering stabilization | R-02, R-04, R-06 |
| R-10 | [x] | Scripts/data/runtime hierarchy cleanup | R-04, R-08 |
| R-11 | [x] | Documentation/UML reconciliation | R-03, R-07, R-09, R-10 |
| R-12 | [ ] | Final integration pass / prototype-to-product cleanup | R-11 |

## Current progress assessment

Redesign tickets R-01..R-11 are complete. Remaining work is R-12 (final integration).

Established and reflected in code + docs:
- monorepo/application boundaries and shared contracts;
- NestJS Mission / MissionResult / SignalQuality feature modules with event-based finalize invalidation;
- route-centric missions; implicit execution (no `ExecutionAttempt`); immutable route and result revisions;
- numeric Signal Quality tiles with client-side palette; Canvas default + retained WebGL adapter;
- workflow-owned map layers and UI; thin MapController; no `*MapWorkspace` shims;
- responsibility-based configuration (`ui.config.ts`, `signal-quality.config.ts`, contracts grid size, env for runtime);
- feature-oriented frontend hierarchy under `workflows/`;
- documentation/UML reconciled to implementation (R-11).

## Definition of done for the redesign phase

The resulting repository should have:
1. deliberate cross-boundary contracts with clear ownership;
2. domain invariants separated from transport DTOs;
3. centralized, responsibility-based configuration;
4. deep modules with small interfaces and hidden implementation complexity;
5. workflow-owned map layers/groups where the ADR says they belong;
6. a feature-oriented frontend hierarchy that reflects actual boundaries;
7. explicit numeric-tile/rendering configuration;
8. clean separation of runtime data, source data, generation scripts, and developer tooling;
9. documentation/UML that matches the implementation;
10. no requirement to introduce or maintain tests during this phase.
