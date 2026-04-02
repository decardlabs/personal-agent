# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and Semantic Versioning.

## [Unreleased]

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

### Changed

- Migration module now supports reusable apply function without import side effects.

### Fixed

- Resolved startup and migration validation blockers by completing dependency installation and command verification.

## [0.1.0] - 2026-04-02

### Added

- Initial project record framework under personal-assistant.
