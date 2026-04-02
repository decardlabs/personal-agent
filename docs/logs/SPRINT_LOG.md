# Sprint Log

## Sprint 2026-W14

### Goal

Establish project governance, records, and release baseline.

### Planned

- Create project docs skeleton
- Define versioning and release workflow
- Record initial architecture decision

### Done

- Project docs skeleton created
- Versioning policy and release process added
- Initial ADR recorded
- Week 1 code scaffolding started with TS strict config and SQLite migration baseline
- Week 2 closed-loop MVP implemented with runnable turn pipeline and event persistence
- Migrate, build, and tests executed successfully
- Week 3 memory layers integrated (session, context, persistent)
- Cross-turn recall behavior implemented and validated
- Week 4 permission policy and approval checkpoint integrated into turn flow
- Risky input approval and reuse behaviors validated with tests
- Week 5 replay test framework added with reusable runner and 5 representative replay cases
- Added dedicated replay test command and validated replay pass rate
- Week 5 COMPLETE: timeout/cancel guard and retry loop added to turn runner
- Extended TurnEventType with tool_timeout, tool_retry, turn_cancelled events
- Replay suite expanded to 10 cases (edge: empty, whitespace, timeout, multi-turn, cold recall)
- 18 tests total (7 unit + 10 replay + 1 index); all green
- Week 6 COMPLETE: tool_error graceful handling and permission expiry check added
- ToolPermissionRepository unit tests added (4 tests: no-perm, valid, future/past expiry)
- Version bumped to 0.2.0-beta.1; CHANGELOG promoted; release record created
- README developer quick-start section added
- 23 tests total across 4 files; all green

### Carry Over

- Week 6: pre-beta hardening, version bump to v0.2.0-beta.1
- Add replay summary report (pass/fail ratio and per-case timing)
- Add permission expiration checks in policy evaluator
- Expand from echo-only flow to pluggable tool routing

### Metrics

- Completed items: 20
- Completion rate: 100%
