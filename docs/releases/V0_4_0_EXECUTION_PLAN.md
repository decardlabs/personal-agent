# v0.4.0 Execution Plan

Status: Draft
Target Release Type: Minor
Owner: personal-agent

## 1. Goal

This release shifts personal-agent from a well-tested CLI loop toward a reusable runtime core.

The release theme is platformization without feature churn:

- keep current user-visible CLI behavior stable
- extract reusable runtime boundaries
- make tools and memory evolvable without inflating `runTurn`
- prepare the codebase for task-centric execution and future control-plane entry points

## 2. Product Direction

personal-agent should evolve in this order:

1. reliable runtime core
2. typed tool/memory/task contracts
3. task execution engine
4. minimal control plane
5. personal workflow automation on top of the above

This intentionally avoids jumping straight to more channels, more UI, or heavier multi-agent orchestration before the core boundaries are ready.

## 3. Workstreams

## 3.1 WS1 — Tool Contract Foundation

Objective: stop encoding builtin tool behavior as scattered `if/else` branches.

Tasks:

1. Add a builtin-tool catalog file under `src/tools/`
2. Define per-tool metadata:
   - tool id
   - capability class
   - default retry policy
   - execution mode
   - response formatter
3. Route `runTurn` builtin tool execution through the catalog
4. Add focused tests for request creation, payload shape, and output formatting

Acceptance:

- existing tool commands keep identical responses
- event payload shape remains stable
- `runTurn` loses direct per-tool branching in execution path

## 3.2 WS2 — Runtime Lifecycle Seams

Objective: isolate runtime phases so CLI is only one entrypoint.

Tasks:

1. Extract lifecycle helpers for:
   - turn normalization
   - reasoning preflight
   - tool execution
   - post-turn memory sync
2. Introduce a runtime context object passed across phases
3. Keep replay suite green while preserving current public APIs

Acceptance:

- `runTurn` becomes orchestration over helpers instead of monolithic control flow
- no change to current replay outcomes

## 3.3 WS3 — Memory Backend Boundary

Objective: keep builtin memory strong while making future providers possible.

Tasks:

1. Add an internal memory backend/provider interface
2. Keep current SQLite-backed store as builtin implementation
3. Separate system bookkeeping keys from durable fact retrieval paths
4. Keep dream/diagnostics behavior intact

Acceptance:

- durable fact retrieval excludes system metadata by design
- current memory diagnostics continue to work

## 3.4 WS4 — Task Engine Upgrade

Objective: promote resumable execution into explicit task contracts.

Tasks:

1. Define typed task step/result contracts
2. Lift task execution logic out of ad hoc command branches
3. Add checkpoint-aware continuation policies
4. Prepare branch-safe execution rules before DAG support

Acceptance:

- resumable task runs have typed step boundaries
- latest/checkpoint/resume flows remain deterministic in tests

## 3.5 WS5 — Minimal Control Plane

Objective: expose runtime state through one internal service surface.

Tasks:

1. Add session registry and runtime status query helpers
2. Centralize event/diagnostic/task summary retrieval
3. Reuse that surface in CLI utility commands
4. Keep the design compatible with future TUI/web/channel adapters

Acceptance:

- dashboard/status/task utilities consume shared query helpers
- no duplicated aggregation logic across CLI entry points

## 4. Delivery Sequence

1. WS1 Tool Contract Foundation
2. WS2 Runtime Lifecycle Seams
3. WS3 Memory Backend Boundary
4. WS4 Task Engine Upgrade
5. WS5 Minimal Control Plane

## 5. Immediate Slice (now)

The first implementation slice for this plan is:

1. add `src/tools/toolCatalog.ts`
2. route builtin tool execution in `runTurn` through the catalog
3. add unit coverage for the catalog helpers
4. keep current tests green

## 6. Exit Criteria

v0.4.0 is ready when:

- tool execution is catalog-driven
- runtime lifecycle seams are explicit
- builtin memory is provider-ready
- task execution has typed contracts
- CLI runtime queries consume shared control-plane helpers

## 7. Risks

1. Risk: architectural refactors create replay drift
- Mitigation: land one thin seam at a time and keep contract tests stable

2. Risk: provider abstractions become over-designed too early
- Mitigation: wrap existing behavior first; add extension points only where the current code already needs them

3. Risk: platformization delays user-visible progress
- Mitigation: each slice must either simplify a hot path or unlock a concrete next capability