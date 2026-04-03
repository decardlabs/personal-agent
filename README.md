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

# Search project content for a keyword
npm run dev -- "search runTurn"

# Build for production
npm run build

# Run all tests
npm test

# Run replay regression suite only
npm run test:replay

# Run replay regression with summary report
npm run test:replay:report

# Run replay regression and export JSON summary
npm run test:replay:report:json
```

### Approve risky inputs (for development)

```bash
node dist/index.js --approve-risky
```

### Interaction mode notes

- No input args: starts interactive mode, prompt with `> `, and keeps the same session memory.
- With input args: runs one turn and exits.
- Type `exit` or `quit` to leave interactive mode.

### Supported commands (MVP)

- `echo <text>`: returns the text directly.
- `search <query>`: searches project files and returns matched lines.
- `read <file>`: reads file contents (supports line ranges in code).
- `set preference <key> <value>`: store user preference (persisted to disk).
- `get preference <key>`: retrieve a stored preference.
- `recall last echo`: reads the latest echoed value from persistent memory.

### Interactive mode utilities

When running in interactive mode, you can use these utility commands:

- `/help`: Display full command reference with examples.
- `/history`: Show your last 50 commands (persisted across sessions).
- `/clear-history`: Clear the command history file.
- `/memory`: Show a compact memory snapshot (preferences/history/facts/context).
- `/diag`: Show memory diagnostics counters.
- `/diag --json`: Export memory diagnostics as JSON (for CI/gating).
- `/model`: Show active LLM model policy (source, fallback, retries, aliases).
- `/model set <value>`: Set preferred model alias or explicit model name.
- `/model clear`: Clear preferred model and return to env/default policy.
- `/consolidate-memory`: Prune stale low-confidence persistent memory entries.
- `exit` or `quit`: Leave interactive mode.

**Command history location**: `~/.claude-personal/repl-history.json`

### Colored output

The assistant uses colored terminal output for better UX:
- 🟢 Green: successful commands (echo, preferences)
- 🔴 Red: permission errors
- 🔵 Blue: informational messages
- 🟡 Yellow: warnings
- 🔷 Cyan: command names and prompts

### Interactive mode examples

```bash
# Start interactive mode
npm run dev

# Then in the REPL:
> /help                              # Show all available commands
> echo hello world                   # Echo text
> search package.json                # Search for files
> read src/index.ts                  # Read file content
> set preference lang python         # Save a preference
> get preference lang                # Retrieve preference
> recall last echo                   # Show previous echo
> /history                           # Show command history
> /clear-history                     # Clear history
> /memory                            # Inspect memory snapshot
> /diag                              # View memory diagnostics
> /diag --json                       # Export diagnostics in JSON
> /model                             # Inspect active model policy
> /model set quality                 # Prefer high-quality model alias
> /model clear                       # Remove preference and use env/default
> /consolidate-memory                # Run memory pruning
> exit                               # Leave interactive mode
```

### Memory auto-consolidation configuration

Auto-consolidation can be enabled and tuned with environment variables:

- `MEMORY_AUTO_CONSOLIDATE_ENABLED`: `true/false` (default `false`)
- `MEMORY_AUTO_CONSOLIDATE_MIN_TURNS`: minimum turns in current session before auto-consolidation (default `20`)
- `MEMORY_AUTO_CONSOLIDATE_MIN_HOURS`: minimum hours between two auto-consolidations (default `24`)
- `MEMORY_AUTO_CONSOLIDATE_MIN_STALE_FACTS`: trigger threshold for stale facts (default `3`)
- `MEMORY_AUTO_CONSOLIDATE_MIN_LOW_CONF_FACTS`: trigger threshold for low-confidence facts (default `5`)

Example:

```bash
export MEMORY_AUTO_CONSOLIDATE_ENABLED=true
export MEMORY_AUTO_CONSOLIDATE_MIN_TURNS=10
export MEMORY_AUTO_CONSOLIDATE_MIN_HOURS=12
npm run dev
```

### LLM integration (optional)

- Set `OPENAI_API_KEY` to enable model responses for non-tool prompts.
- Optional: set `OPENAI_MODEL` (default policy alias: `balanced` -> `gpt-4o-mini`).
- Optional: set `OPENAI_BASE_URL` to use a compatible gateway endpoint.
- Optional: set `OPENAI_FALLBACK_MODEL` for automatic fallback when primary model is unavailable.
- Optional runtime controls:
	- `OPENAI_TIMEOUT_MS` (default `20000`)
	- `OPENAI_MAX_RETRIES` (default `1`)
	- `OPENAI_TEMPERATURE` (default `0.2`)
	- `OPENAI_MAX_OUTPUT_TOKENS` (unset by default)
- If `OPENAI_API_KEY` is not set, assistant falls back to the local MVP response path.

Example:

```bash
export OPENAI_API_KEY="your_api_key"
export OPENAI_MODEL="gpt-4o-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"
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

# Run replay regression with summary metrics output
npm run test:replay:report

# Run replay regression and persist JSON metrics output
npm run test:replay:report:json

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

# Optional: generate machine-readable replay summary
npm run test:replay:report:json

# Confirm release version
cat VERSION
```
