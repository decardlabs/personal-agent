# Development Log

## 2026-04-02

### Summary

- Created personal-assistant subproject.
- Established development and release recording framework.

### Work Items

- Created documentation structure: docs/adr, docs/releases, docs/logs.
- Added core lifecycle docs: roadmap, changelog, versioning policy, release process.
- Added baseline logs: devlog, sprint log, QA log, risk log.

### Decisions

- Use Semantic Versioning as default version scheme.
- Keep logs append-only for traceability.

### Next

- Initialize code scaffolding and persistence layer.
- Define memory schema and repository interfaces.

### Code Kickoff Update

- Created implementation scaffolding for agent, memory, storage, observability, and policy modules.
- Added strict TypeScript configuration and npm scripts for dev, build, test, and migrate.
- Added SQLite bootstrap, baseline migration, and session event repository.
- Added initial state machine test.

### Validation Notes

- Dependency installation was attempted but stalled in the current environment, so build and test scripts could not be executed yet.
- Source files were created and static error scan was run.

### Week 2 MVP Loop Update

- Implemented input normalization module and simple echo tool detection.
- Implemented turn runner pipeline for input normalization, reasoning start, tool call, tool result, and turn completion events.
- Added event query support in session event repository.
- Refactored migration module to expose reusable helper without import side effects.
- Updated application entrypoint to execute one runnable turn and persist event history.

### Week 2 Validation

- Dependency installation completed successfully.
- Migration command passed.
- Build command passed.
- Test suite passed (3 tests total).

### Week 3 Memory Layer Update

- Implemented session memory store for per-session runtime facts.
- Implemented context snapshot memory provider.
- Implemented persistent memory store backed by SQLite memory_facts table.
- Added memory coordinator and integrated it into runTurn pipeline.
- Added recall behavior: "recall last echo" reads persistent memory from prior turns.

### Week 3 Validation

- Migration command passed.
- Build command passed.
- Test suite passed (4 tests total).

### Week 4 Permission Update

- Added permission policy module with risky input detection.
- Added tool permission repository backed by tool_permissions table.
- Integrated permission checkpoint into turn pipeline with required and granted events.
- Added runtime flag support for explicit risky approval in CLI entrypoint.
- Implemented permission reuse for previously approved risky inputs.

### Week 4 Validation

- Migration command passed.
- Build command passed.
- Test suite passed (6 tests total).

### Week 5 Replay and Reliability Update

- Added replay case definitions for representative turn scenarios.
- Added reusable replay runner that executes multi-step cases against in-memory SQLite.
- Added dedicated replay test suite and npm script (`test:replay`).
- Updated engineering backlog to focus on timeout, retry, and replay expansion.

### Week 5 Completion: Timeout, Retry, and Expanded Replay

- Extended `TurnEventType` with `tool_timeout`, `tool_retry`, `turn_cancelled`.
- Added `turnTimeoutMs` option: turn cancels with `turn_cancelled` event if elapsed >= limit.
- Added `maxToolRetries` option: retries tool on error and emits `tool_retry` event per attempt.
- Added injectable `echoToolRunner` to `TurnOptions` for test isolation.
- Expanded replay suite from 5 to 10 cases covering: timeout, empty input, whitespace, multi-turn echo, and cold recall (no prior echo).

### Week 5 Validation

- Migration command passed.
- Build command passed (dist/index.js 13.67 KB).
- Full test suite passed: 18 tests across 3 files (7 unit + 10 replay + 1 index).
- Replay-only suite passed: 10 replay cases, all green.
