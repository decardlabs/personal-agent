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

## Completed — M3 Sprint (Week 6)

1. ✅ Replay summary metrics (pass rate, per-case elapsed time, failure classification).
2. ✅ Permission risk detection upgraded to mixed strategy (command structure + regex fallback).
3. ✅ Search-tool deterministic replay via injectable `mockSearchOutput`.
4. ✅ CI quality gate (build + test + replay) with JSON artifact upload.
5. ✅ Roadmap and CHANGELOG synced to post-`v0.2.0-beta.1` state.

## Current Sprint — M3 Close-out + M4 Start

1. Add `reports/` to `.gitignore` so generated JSON is not committed.
2. Honour `PA_LOG_LEVEL` env var in logger; set `silent` in Vitest global setup to eliminate migration noise.
3. Refactor `stateMachine.ts`: remove global mutable state, return per-turn state context.
4. Narrow `getPermissionKey` to command-semantic fingerprint (command word + flags only).
5. Implement `read-file` tool: `src/tools/readFileTool.ts` with path safety checks and line-range support.
6. Implement `PreferenceRepository` over `user_preferences` table and wire into `MemoryCoordinator`.
7. Add `set preference` / `get preference` commands through `inputNormalizer` + `runTurn`.
8. Add session history window to `SessionMemoryStore`; pass last-N-turns to LLM prompt.
9. Enrich `llmResponder` call with context snapshot + persistent memory facts + session history.
10. Write back confident LLM results to `PersistentMemoryStore` (threshold: confidence ≥ 0.8).

## Progress Update — 2026-04-04 (Phase A)

Completed:

1. Preference command chain consistency validated end-to-end.
2. Session history window behavior standardized and edge-cases covered (including `historyLimit=0`).
3. LLM context injection unified through `buildLLMContextBundle`.
4. Confidence-based persistent-memory write policy and audit trail implemented.
5. Write-decision observability added to diagnostics, `/diag`, `/status`, and dashboard memory panel.
6. Replay suite expanded with preference round-trip and confidence-filtered LLM-context scenarios.

Completed in this update:

1. Documentation synchronization and release-note alignment for the above changes.

## Design-to-Code Mapping (v1.0-Final)

Source design baseline: `personal-assistant-design-final.md`.

| Design area | Current implementation | Status | Next step |
|---|---|---|---|
| 对话交互层（会话/意图/上下文） | `src/agent/runTurn.ts`, `src/agent/inputNormalizer.ts`, `src/memory/memoryCoordinator.ts` | Partial | Add confidence-based intent fallback and explicit clarification prompts for low-confidence inputs. |
| 工具调用体系（注册/执行/错误处理） | `src/tools/*`, `src/commands/utilityRegistry.ts`, `src/policies/permissionPolicy.ts` | Partial | Add tool metadata normalization (timeout/retry/sandbox policy) and unified execution contract. |
| 记忆系统集成（检索/写入/审计） | `src/memory/*`, `src/storage/memoryFactRepository.ts` | Strong | Extend from current layered memory to explicit typed memory families (episodic/semantic/procedural). |
| 任务执行引擎（DAG/状态机/检查点） | `src/agent/taskStateMachine.ts`, `src/storage/taskCheckpointRepository.ts`, `src/agent/taskResume.ts`, `src/testing/*` | Partial | Extend from single-task resumable flow to explicit DAG scheduling and checkpoint-aware continuation policies. |
| 个性化与学习（画像/偏好学习） | `PreferenceRepository` + set/get preference path (`src/memory/preferenceMemory.ts`, `src/agent/inputNormalizer.ts`) | Early | Add preference learning signals with decay/rollback and confidence audit trail for profile updates. |
| 安全与授权（L0-L4/风险引擎） | `src/policies/permissionPolicy.ts`, `src/storage/toolPermissionRepository.ts` | Partial | Expand risk categories and map to explicit L0-L4 action classes instead of command-pattern-only rules. |
| 成本控制（预算/路由/缓存） | Model selection policy in `src/llm/modelManagement.ts` | Early | Add per-session token budget ledger + soft/hard limits + diagnostics exposure. |
| TUI/UX（任务树/状态面板） | Dashboard + status panels in `src/ui/renderers/*`, `src/utils/interactionPanels.ts` | Partial | Add task-tree progress view and interrupt/resume UX for multi-step execution. |
| 初始化与生命周期（首启/目录/迁移） | DB init/migration in `src/storage/db.ts`, `src/storage/migrate.ts`; CLI entry in `src/index.ts` | Partial | Add first-run setup flow and persistent runtime home layout bootstrap checks. |

Execution rule:

1. Prioritize rows marked `Early` that unblock reliability or safety.
2. Land each row as independently testable slices with replay coverage.
3. Keep roadmap and changelog synchronized after each row reaches `Partial` or `Strong`.

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
