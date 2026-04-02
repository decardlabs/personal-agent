# Engineering Plan

## Objective

Start implementation of a personal intelligent work assistant with a stable CLI agent loop, layered memory, and safe tool execution.

## Delivery Principles

- Build one closed loop first, then expand capabilities.
- Keep memory model explicit and testable.
- Enforce permission gates before high-risk execution.
- Ship in small weekly increments with clear acceptance criteria.

## Workstreams

### WS1 Core Agent Loop

- Input normalization pipeline
- Reasoning and tool-call loop
- Result feedback and continuation

### WS2 Memory System

- Session memory (in-process)
- Context snapshot memory (project-level)
- Persistent memory (SQLite)

### WS3 Permission and Safety

- Tool risk levels and policy checks
- Approval flow for write and risky operations
- Execution audit trail

### WS4 Observability and Quality

- Structured logs and trace IDs
- Smoke and integration test suites
- Replay-based regression evaluation

## Architecture Modules (Planned)

- src/agent: orchestration and state machine
- src/memory: memory services and selectors
- src/storage: SQLite repositories and migrations
- src/policies: permission and risk policies
- src/observability: logger and tracing helpers
- src/tools: internal tools and adapters

## Six-Week Plan

### Week 1 Foundation

- Create runtime skeleton and module boundaries.
- Add TypeScript strict config and base scripts.
- Introduce SQLite connection and migration bootstrap.
- Implement minimal domain types for message, turn, tool call.

Acceptance:

- Project builds and starts from CLI entry.
- DB migration command creates baseline schema.

### Week 2 Closed Loop MVP

- Implement input normalization and turn creation.
- Implement basic reason-tool-result loop with one read-only tool.
- Persist turn and tool events.

Acceptance:

- One full interaction loop runs end-to-end.
- Events are persisted and queryable.

### Week 3 Memory Layer V1

- Add session/context/persistent memory interfaces.
- Integrate memory retrieval before each reasoning turn.
- Add memory write policies after tool results.

Acceptance:

- Assistant can reuse prior turn facts in the same session.
- Persistent memory entries can be created and read.

### Week 4 Permission and Safety

- Add policy evaluator for tool execution.
- Add explicit approval flow for risky tools.
- Record approval decisions to permission store.

Acceptance:

- Risky tool call is blocked without approval.
- Approved actions are auditable.

### Week 5 Reliability and Tests

- Add integration tests for closed loop.
- Add replay tests for top 10 representative tasks.
- Add timeout, cancellation, and retry behaviors.

Acceptance:

- Integration tests pass reliably.
- Replay pass rate reaches baseline target.

### Week 6 Pre-Beta Hardening

- Stabilize logs and error paths.
- Improve developer docs and runbooks.
- Prepare v0.2.0-beta.1 release artifacts.

Acceptance:

- Release checklist is green.
- Beta release record is completed.

## Current Sprint Backlog (Updated)

1. Expand replay case set from 5 to 10 representative tasks.
2. Add timeout and cancellation behavior in turn runner.
3. Add retry policy for transient tool failures.
4. Add replay summary report (pass/fail ratio and per-case timing).
5. Add permission expiration checks in policy evaluator.

## Definition of Done

- Code merged with tests and docs updates.
- CHANGELOG updated for user-visible changes.
- DEVLOG and SPRINT_LOG updated for completed work.
- Risks and mitigations updated when scope changes.

## Risks and Controls

- Risk: architecture drift due to fast feature additions.
  - Control: enforce module boundaries and ADR updates.
- Risk: memory writes become noisy and low quality.
  - Control: add confidence threshold and write policy.
- Risk: unstable tool behavior.
  - Control: add retries, timeouts, and deterministic replay tests.
