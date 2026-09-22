# R-05 — Deep-module architecture proposal

## Objective
Design the deep modules before implementation.

## Read
- `docs/architecture-target.md`
- `CONTEXT.md`
- current frontend/backend feature code
- `docs/adr/0005-workflow-owned-map-surface-and-ui.md`
- current contracts/configuration

## Instruction
Act as the architecture specialist (the requested “Matt” role). Propose concrete deep-module boundaries using this criterion:

> substantial functionality + simple interface + hidden implementation complexity.

For each proposed module, specify:
- responsibility;
- public interface;
- hidden implementation;
- dependencies;
- caller(s);
- why the interface is stable;
- what complexity it prevents leaking.

Pay particular attention to:
- mission application workflow;
- administrative navigation;
- KPI projection/rendering;
- map-layer ownership;
- data loading;
- configuration.

Avoid creating interfaces that merely rename existing classes or forward every method.

## Output
Write `docs/deep-modules-proposal.md`.

This ticket is design-only. Do not implement the proposal.

## Constraints
No tests. Do not introduce abstractions solely for theoretical future features.
