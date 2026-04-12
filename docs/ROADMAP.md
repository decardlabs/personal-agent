# Roadmap

## Vision

Build a reliable personal intelligent work assistant based on a CLI agent architecture with strong memory, permission safety, and release discipline.

## Milestones

### M1 - Foundation (Target: 2026-04)

- Define architecture and memory model
- Establish records and release governance
- Scaffold core modules

### M2 - MVP Closed Loop (Target: 2026-05)

- Input normalization to tool execution loop
- Basic memory layers (session/context/persistence)
- Permission gating with audit logging

### M3 - Quality and Evaluation (Target: 2026-06)

- Replay-based evaluation suite
- Reliability and timeout handling
- Beta release with release notes workflow

### M4 - Personalization (Target: 2026-07)

- Preference memory and behavior adaptation
- Productivity integrations and automation packs

### M5 - Runtime Platformization (Target: 2026-08)

- Promote the CLI agent loop into a reusable runtime contract
- Introduce declarative tool metadata and execution policies
- Decouple memory into builtin plus optional backend/provider slots
- Add task-oriented control-plane primitives for sessions, events, and status

## Current Focus

- M1 Foundation: Completed
- M2 MVP Closed Loop: Completed (echo/search tools, layered memory, permission gate)
- M3 Quality and Evaluation: Completed (replay metrics, mixed permission strategy, CI gate + artifact upload)
- M4 Personalization: In progress (Phase A items 1-6 complete: preference chain, history window, unified LLM context bundle, write policy, diagnostics observability, replay expansion)
- M5 Runtime Platformization: In progress (tool contract foundation landed; lifecycle seam extraction started)

## Execution Tracking Rule

`docs/ROADMAP.md` is the live execution tracker for active development.

- Update completed slices here when code lands.
- Record one current in-progress item at a time where practical.
- Record the next planned slice immediately after each completed slice.
- Keep implementation status brief, concrete, and file-aware rather than aspirational.

## Active Execution Snapshot

Date: 2026-04-12

### M5 Runtime Platformization

Status: In progress

Completed:

1. Overall M5 platformization track added to roadmap and engineering plan.
2. v0.4.0 execution plan recorded in `docs/releases/V0_4_0_EXECUTION_PLAN.md`.
3. Builtin tool execution is now routed through a declarative catalog in `src/tools/toolCatalog.ts`.
4. `runTurn` post-turn finalization was extracted into `src/agent/turnFinalizer.ts` to begin lifecycle seam isolation.
5. Full test suite remains green after both slices (`npm test`).

In progress:

1. Continue thinning `src/agent/runTurn.ts` by extracting reasoning preflight and command-resolution phases into reusable helpers.

Next up:

1. Introduce a dedicated turn preflight helper for normalized input, tool-intent resolution, and initial context packaging.
2. Start the memory backend boundary work so durable facts and system bookkeeping are no longer mixed in one retrieval path.
3. Move task execution toward typed contracts after the runtime seam extraction is stable.

## M4 Backlog (target 2026-05 → 2026-06)

### Layer 1 — M3 Close-out (immediate)

1. Add `reports/` to `.gitignore`; CI artifact replaces local file.
2. Silence test-environment migration logs via `PA_LOG_LEVEL=silent` in test setup.
3. Isolate state machine per turn (remove global mutable state).
4. Narrow `permission_key` to command-semantic fingerprint instead of full raw input.
5. Implement `read-file <path>` tool (read file slice, low-risk, permission-gated).

### Layer 2 — M4 Core Personalization (4-6 weeks)

6. Implement `PreferenceRepository` + `PreferenceStore` over existing `user_preferences` table.
7. Support `set preference <key> <value>` / `get preference <key>` commands.
8. Inject user preferences into context snapshot for every reasoning turn.
9. Add session history sliding window (last N turns) passed to LLM as conversation context.
10. Enrich LLM system prompt with context snapshot, session history, and persistent memory facts.
11. Write confident LLM conclusions back to persistent memory (confidence threshold gate).

### Layer 3 — Tool Expansion (parallel / on-demand)

12. ✅ `list <dir>` — lists directory entries (read-only, safe). (`src/tools/listDirTool.ts`)
13. ✅ `summarize <file>` — reads file then calls LLM for a summary. (Research → Synthesis two-step, Coordinator-inspired)
14. ✅ `open <url>` / `fetch <url>` — fetches URL text content (SSRF-protected, always permission-gated). (`src/tools/openUrlTool.ts`)

### Layer 4 — Architecture: Coordinator Mode (Claude-Code inspired)

15. Feature flag `coordinator_mode` added — enables Research → Synthesis → Action phase dispatch for complex tasks.
16. Feature flag `memory_dream` added — gates periodic background memory consolidation (KAIROS autoDream-inspired).
17. Feature flag `verbose_tools` added — tool-call debug logging for replay analysis.

### Layer 5 — Next (future)

18. Implement `coordinator_mode` runtime: for complex inputs, spawn paralell Research workers then a Synthesis pass before responding.
19. Implement `memory_dream` runtime: schedule periodic `PersistentMemoryStore` consolidation using LLM.
20. Shell-execute tool with sandboxed permission gating (L3/L4 approval).
21. MCP client adapter: connect to external MCP servers as tool providers.

### Layer 6 — Platformization (new primary track)

22. [In progress] Introduce a declarative builtin-tool catalog with execution metadata, retries, and result formatting policies.
23. [In progress] Extract runtime lifecycle hooks (`turn start`, `prefetch`, `tool execute`, `post-turn sync`, `session end`) behind a reusable runtime facade.
24. [Planned] Split memory into builtin store plus optional backend/provider interface without changing default behavior.
25. [Planned] Add typed task execution contracts so resumable workflows are no longer encoded only inside `runTurn` branches.
26. [Planned] Add a minimal control-plane API for session registry, event queries, diagnostics, and runtime status.
