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

## Current Focus

- M1 Foundation: Completed
- M2 MVP Closed Loop: Completed (echo/search tools, layered memory, permission gate)
- M3 Quality and Evaluation: Completed (replay metrics, mixed permission strategy, CI gate + artifact upload)
- M4 Personalization: Starting

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

12. `list <dir>` — lists directory entries (read-only, safe).
13. `summarize <file>` — reads file then calls LLM for a summary.
14. `open-url <url>` — fetches URL text content (requires explicit permission approval).
