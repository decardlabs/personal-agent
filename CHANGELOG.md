# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added

### Changed

### Fixed

---

## [0.2.0-beta.2] - 2026-04-04

### Added

- Interactive CLI mode in `src/index.ts` when no input args are provided.
- `exit` and `quit` commands for leaving interactive mode.
- Optional OpenAI responder integration for non-tool prompts via `OPENAI_API_KEY`.
- `src/llm/openaiResponder.ts` for Chat Completions API calls.
- `search <query>` command and `src/tools/searchTool.ts` for project-wide file content search.
- `detectSearchCommand` parser in `inputNormalizer.ts`.
- `searchToolRunner` injectable in `TurnOptions` for deterministic test isolation.
- Replay suite summary statistics via `runReplaySuite`: pass rate, per-case elapsed time, failure classification (assertion_mismatch / timeout / unexpected_error / unknown).
- `formatReplaySuiteSummary` for human-readable terminal output.
- `src/testing/replayReport.ts` CLI entry with optional `--json <path>` export.
- `test:replay:report` and `test:replay:report:json` npm scripts.
- CI workflow uploads `reports/replay-summary.json` as a build artifact on every run.
- Permission risk detection upgraded to mixed strategy: command-structure analysis first, regex fallback second.
- `src/policies/permissionPolicy.test.ts` unit test suite for the permission evaluator.
- `PA_LOG_LEVEL` environment variable controls log verbosity (default: `info`).
- Replay coverage expanded with preference round-trip scenarios (`set/get preference`) and LLM-context confidence-filtering validation.
- Replay runner supports deterministic seeded persistent facts and a mock LLM responder mode for context-level assertions.

### Changed

- CLI startup behavior: with input args it runs one-shot; without args it enters REPL.
- `runTurn` is now async and can call an injected `llmResponder` before fallback.
- Fallback response updated to reflect both echo and search command availability.
- CI quality gate now covers build, unit tests, replay regression, and replay JSON report generation.
- ROADMAP current focus updated to reflect M3 completion and M4 start.
- Vitest discovery scope now targets project tests under `src/**/*.test.ts`, preventing local reference repositories from being included in test runs.

### Fixed

## [0.2.0-beta.1] - 2026-04-02

### Added

- Initialized project documentation and lifecycle recording system.
- Added roadmap, development log, sprint log, QA test log, and risk log templates.
- Added ADR process and initial architecture decision.
- Added release process and versioning policy.
- Added TypeScript project skeleton with strict config, scripts, and module boundaries.
- Added SQLite bootstrap, migration runner, and baseline schema.
- Added session event repository with per-turn event query support.
- Added MVP turn runner with input normalization, echo tool execution, and result feedback.
- Added unit tests for state machine and turn pipeline.
- Added session/context/persistent memory layer implementations and coordinator wiring.
- Added persistent memory repository over memory_facts table.
- Added cross-turn recall command support ("recall last echo").
- Added permission policy module for risky input detection and approval checks.
- Added tool permission repository with persistent grant storage and reuse.
- Added replay test framework with reusable case runner and 5 baseline replay scenarios.
- Added dedicated replay test script for focused regression execution.
- Added `tool_timeout`, `tool_retry`, `turn_cancelled` event types to `TurnEventType`.
- Added `turnTimeoutMs` option to cancel turns that exceed a configured duration.
- Added `maxToolRetries` option to retry transient tool execution failures.
- Added `echoToolRunner` injectable to `TurnOptions` for test isolation.
- Expanded replay suite to 10 cases covering empty input, whitespace, timeout, multi-turn, and cold recall.
- Added `tool_error` event type for graceful tool failure reporting.
- Added permission expiry check: grants with a past `expires_at` are treated as not granted.
- Added developer quick-start section to README with setup, run, and test instructions.
- Added `ToolPermissionRepository` unit test suite covering grant, expiry, and no-permission paths.

### Changed

- Migration module now supports reusable apply function without import side effects.
- Turn pipeline now stores and retrieves memory during reasoning and feedback stages.
- Turn pipeline now enforces permission checkpoints and emits approval-related events.
- Engineering backlog now tracks replay expansion and reliability behaviors (timeout/cancel/retry).

### Fixed

- Resolved startup and migration validation blockers by completing dependency installation and command verification.
- Fixed missing cross-turn memory behavior by integrating persistent memory read/write flow.
- Fixed unsafe execution path by requiring explicit approval for risky input patterns.

## [0.1.0] - 2026-04-02

### Added

- Initial project record framework under personal-assistant.
