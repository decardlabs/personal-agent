# v0.3.0 Execution Plan

Status: Draft
Target Release Type: Minor
Owner: personal-agent

## 1. Scope

This release focuses on hardening and operability after the recent architecture upgrades:

- Coordinator mode runtime stabilization
- Memory Dream observability and reliability
- Metrics/reporting command for operational decisions
- Release quality gates and documentation alignment

Out of scope for v0.3.0:

- Full shell-exec capability (design only, implementation in next milestone)
- MCP adapter integration

## 2. Workstreams and File-Level Tasks

## 2.1 Runtime Stabilization

Objective: Lock behavior for feature-gated intelligence paths.

1. Add coordinator on/off parity tests
- File: src/agent/runTurn.test.ts
- Add cases asserting fallback LLM behavior when coordinator_mode is disabled
- Add cases asserting research+synthesis metadata when coordinator_mode is enabled

2. Add Memory Dream reason-code matrix tests
- File: src/agent/memoryDream.test.ts
- Add explicit tests for LOCKED, COOLDOWN, MIN_SESSIONS, LLM_OFF, LLM_FAIL

3. Guard event payload contracts
- File: src/agent/runTurn.test.ts
- Assert memory_dream_completed and memory_dream_skipped payload schema (reason, reasonCode, guidance, counters)

Acceptance:
- All tests pass
- No behavioral regressions in replay suite

## 2.2 Metrics and Reporting

Objective: Make runtime health measurable from the CLI.

1. Add utility command: /metrics dream
- File: src/commands/utilityRegistry.ts
- Register command metadata and aliases

2. Implement metrics aggregation from session events
- File: src/index.ts
- Add command handling path returning:
  - dream attempts
  - completed vs skipped
  - reasonCode distribution
  - avg wroteFactCount

3. Add formatting helper for stable output
- File: src/utils/interactionPanels.ts
- Add compact text panel formatter for metrics output

4. Test coverage for command parsing and output
- Files:
  - src/commands/utilityRegistry.test.ts
  - src/utils/interactionPanels.test.ts

Acceptance:
- /metrics dream returns deterministic output in tests
- Output includes reasonCode histogram and completion rate

## 2.3 Feature-Flag and Config Hygiene

Objective: Reduce misconfiguration risk in real runs.

1. Validate critical env + feature combinations at startup
- File: src/index.ts
- Warnings for:
  - memory_dream enabled but OPENAI_API_KEY missing
  - coordinator_mode enabled without llm responder path

2. Add docs for new env knobs
- File: README.md
- Add table for MEMORY_DREAM_* and FEATURE_FLAGS usage

3. Add tests for startup warning behavior
- File: src/index.test.ts

Acceptance:
- Startup warnings are clear and actionable
- No runtime crash on invalid combinations

## 2.4 Release Packaging

Objective: Make release reproducible and auditable.

1. Prepare release notes draft
- File: docs/releases/records/v0.3.0-notes.md
- Use template and summarize key user-visible changes

2. Update changelog and version
- Files:
  - CHANGELOG.md
  - VERSION

3. Complete release record
- File: docs/releases/records/v0.3.0-record.md

4. Run pre-release checklist
- File: docs/releases/PRE_RELEASE_CHECKLIST.md

Acceptance:
- Checklist complete
- Artifacts consistent (version, changelog, notes, record)

## 3. Proposed Delivery Sequence

1. Runtime stabilization tests (2.1)
2. Metrics command (2.2)
3. Config hygiene and docs (2.3)
4. Release packaging (2.4)

## 4. Exit Criteria

v0.3.0 can be released when:

- npm test passes on clean tree
- Replay suite remains fully green
- /metrics dream is available and documented
- Memory Dream and Coordinator behavior are covered by explicit tests
- Release artifacts are complete and internally consistent

## 5. Risks and Mitigations

1. Risk: flaky assertions due to dynamic text or timestamps
- Mitigation: snapshot only normalized fields; avoid exact timestamp matching

2. Risk: metrics command drifts with event payload changes
- Mitigation: centralize payload shape checks in tests

3. Risk: feature interactions become hard to reason about
- Mitigation: keep startup warnings and feature-gate matrix in docs
