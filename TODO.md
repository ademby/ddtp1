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
| R-01 | [ ] | Architecture reconciliation / source of truth | R-00 |
| R-02 | [ ] | Contracts and schemas redesign | R-01 |
| R-03 | [ ] | Backend domain/persistence alignment | R-02 |
| R-04 | [ ] | Configuration architecture | R-01 |
| R-05 | [ ] | Deep-module architecture proposal (Matt/architecture agent) | R-01, R-02, R-04 |
| R-06 | [ ] | Deep-module implementation | R-05 |
| R-07 | [ ] | Frontend workflow/map-layer ownership refactor | R-01, R-06 |
| R-08 | [ ] | Frontend feature-module/folder hierarchy | R-06, R-07 |
| R-09 | [ ] | KPI numeric-tile configuration + rendering stabilization | R-02, R-04, R-06 |
| R-10 | [ ] | Scripts/data/runtime hierarchy cleanup | R-04, R-08 |
| R-11 | [ ] | Documentation/UML reconciliation | R-03, R-07, R-09, R-10 |
| R-12 | [ ] | Final integration pass / prototype-to-product cleanup | R-11 |

## Current progress assessment

The project is **well beyond an initial prototype**, but the redesign is not yet complete.

Already substantially established:
- monorepo/application boundaries;
- shared contracts package;
- NestJS backend feature modules;
- route-centric mission model;
- immutable route/result revision direction;
- backend-controlled execution direction;
- numeric Signal Quality tile direction;
- workflow-owned map/UI direction documented in ADRs;
- Canvas/WebGL renderer seam documented.

Still inconsistent or prototype-level:
- contracts do not yet fully reflect the domain decisions (notably measurement/KPI ownership and runtime validation);
- the documented workflow-owned `LayerGroup` direction is not fully reflected by the current `*MapWorkspace` interfaces;
- configuration is not centralized by responsibility;
- deep-module boundaries have not been systematically designed;
- frontend hierarchy still reflects incremental prototype growth;
- scripts/data organization is still mixed;
- KPI tile/rendering configuration needs to be made explicit and experimentally tunable without coupling backend/frontend constants;
- documentation, ADRs, UML, and code need a final reconciliation after implementation.

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
