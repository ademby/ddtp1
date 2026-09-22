# Design decisions — 2026-09-22

## Scope
The current completion target is a working operator-facing mobile-network drive-test platform prototype: mission planning/execution through the platform's drone integration, immutable result validation/revisions, and geographic exploration of finalized KPI projections such as Signal Quality.

Production-grade fleet management, authentication/authorization, advanced telemetry, deployment hardening, and similar concerns remain outside the current completion target unless explicitly added later.

## Domain decisions

### Missions
- A mission is primarily a planned, route-centric drive-test operation.
- A mission owns immutable route revisions. Editing the route creates a new revision rather than mutating an existing revision.
- An execution references one specific route revision.
- A mission may have execution history, but execution attempts are not currently modeled as a first-class domain entity.
- A mission name may describe the covered region.
- A dedicated region field or metadata may be introduced later if the domain requires it.
- An operational area is not currently a mission aggregate.

### Execution
- The backend is the control authority: the platform is the execution "cockpit".
- Some state transitions require drone participation, but the drone does not independently own the mission lifecycle.
- For now, execution remains implicit in the mission/result relationship; a dedicated `ExecutionAttempt` domain model is deferred until concrete requirements justify it.

### Measurements
- A Measurement is an immutable raw observation collected during execution at a point in space and time.
- Derived KPI values are not stored as part of the Measurement domain concept.

### Results and validation
- Validation is currently performed manually by an operator.
- Individual measurements may be accepted/rejected during validation.
- A finalized result revision is immutable.
- A correction can create a new revision from an already-finalized revision.
- Exactly one finalized revision is authoritative at a time.
- KPI projections use the current authoritative finalized revision.

### KPI terminology
- KPI is the generic concept for a key performance indicator derived from measurement data.
- Signal Quality is the concrete KPI currently implemented.
- KPI projection is a derived representation of a KPI over approved measurements.
- KPI exploration is available only after result finalization.
- Do not introduce a generic persistent KPI hierarchy until multiple concrete KPIs demonstrate a real need for shared domain behavior.

## Design-process decisions

### Configuration
Configuration should be centralized enough that developers have an obvious place to find tunable behavior. It will cover more than UI settings. During the architecture design we will distinguish configuration by responsibility (for example application/domain defaults, data/projection parameters, rendering/UI parameters, and infrastructure/runtime settings) rather than creating one indiscriminate global configuration object.

### Types and contracts
The project needs deliberate ownership for types as well as API contracts. We will establish a centralized/shared contract and type strategy where cross-boundary types belong, while keeping implementation-private types local to the module that owns them. A global dump of every TypeScript type is not the goal.

### Documentation
Architecture documentation is part of the design loop. As decisions become clear, CONTEXT.md, ADRs, UML, and related documentation are updated during the corresponding design work rather than deferred to a later cleanup phase.
