# Personal Assistant Subproject

This subproject tracks development and release lifecycle for a personal intelligent work assistant.

## Scope

- Product planning and requirement tracking
- Architecture and technical decisions
- Development progress and milestones
- Testing and quality logs
- Risk tracking and mitigations
- Versioning and release notes

## Documentation Index

- Project roadmap: docs/ROADMAP.md
- Engineering plan: docs/ENGINEERING_PLAN.md
- Development log: docs/logs/DEVLOG.md
- Sprint log: docs/logs/SPRINT_LOG.md
- Weekly execution checklist: docs/logs/WEEKLY_EXECUTION_CHECKLIST.md
- Test log: docs/logs/QA_TEST_LOG.md
- Risk log: docs/logs/RISK_LOG.md
- Version policy: docs/releases/VERSIONING_POLICY.md
- Release process: docs/releases/RELEASE_PROCESS.md
- Pre-release checklist: docs/releases/PRE_RELEASE_CHECKLIST.md
- Release notes template: docs/releases/RELEASE_NOTES_TEMPLATE.md
- Release record template: docs/releases/RELEASE_RECORD_TEMPLATE.md
- Release records: docs/releases/records/
- Changelog: CHANGELOG.md
- ADR index: docs/adr/ADR_INDEX.md

## Start Here

1. Update roadmap with current target and milestone.
2. Append daily updates to DEVLOG.
3. Record architecture decisions in ADR files.
4. Update CHANGELOG for each user-visible change.
5. Create release notes from template before each version tag.

## Developer Quick-Start

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start the assistant in interactive mode (REPL)
npm run dev

# Start the assistant for one turn (one-shot)
npm run dev -- "echo hello"

# Build for production
npm run build

# Run all tests
npm test

# Run replay regression suite only
npm run test:replay
```

### Approve risky inputs (for development)

```bash
node dist/index.js --approve-risky
```

### Interaction mode notes

- No input args: starts interactive mode, prompt with `> `, and keeps the same session memory.
- With input args: runs one turn and exits.
- Type `exit` or `quit` to leave interactive mode.

### LLM integration (optional)

- Set `OPENAI_API_KEY` to enable model responses for non-tool prompts.
- Optional: set `OPENAI_MODEL` (default: `gpt-4o-mini`).
- If `OPENAI_API_KEY` is not set, assistant falls back to the local MVP response path.

Example:

```bash
export OPENAI_API_KEY="your_api_key"
export OPENAI_MODEL="gpt-4o-mini"
npm run dev
```

### Project structure

```
src/
	agent/         — turn pipeline, state machine, input normalisation
	memory/        — session, context, and persistent memory stores
	policies/      — permission evaluation and risk detection
	storage/       — SQLite repositories and migration runner
	tools/         — internal tool implementations
	testing/       — replay test cases and runner
	observability/ — structured logger
```

## Testing Workflow

### Daily development (fast path)

```bash
# Run unit/integration tests
npm test

# Run replay regression only
npm run test:replay

# Pre-merge quick check
npm run build && npm test
```

### Pre-release validation (full gate)

```bash
# Ensure dependencies are current
npm install --no-audit --no-fund

# Ensure schema is up to date
npm run migrate

# Full verification
npm run build && npm test && npm run test:replay

# Confirm release version
cat VERSION
```
