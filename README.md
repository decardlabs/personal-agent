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
- `/dashboard`: Render the read-only terminal dashboard snapshot.
- `/dashboard --compact`: Render a condensed dashboard view.
- `/dashboard --detailed`: Render a fuller dashboard view with timing and model decision details.
	- Dashboard header includes a priority-sorted summary strip with status tags and compact values (for example `gpt-4o-mini@preference`).
	- Session symbols are graded: `+ACTIVE`, `-NONE`.
	- View symbols are graded: `=STANDARD`, `~COMPACT`, `+DETAILED`.
	- Model status symbols are graded: `+ON`, `~FALLBACK`, `-OFF`.
	- Memory status symbols are graded: `.OK`, `!WARN`, `!!HOT`.
	- Summary strip width is state-driven and weighted (memory/model wider than session/view, with extra boost in HOT/fallback scenarios) via configurable weight profiles.
	- Summary strip ordering is handled by a dedicated priority policy (including HOT memory pinning).
	- With `verbose_diag`, dashboard shows a strategy snapshot line and a structured `strategy_json` subline for tooling.
	- In `--detailed` view with `verbose_diag`, an additional `strategy_json_verbose` line exposes full-key fields (`weightProfile`, `orderingPolicy`, `truncationPolicy`).
	- Strategy JSON debug lines include schema version `strategy.v1` for stable tooling integration.
	- When memory action reaches `consolidate`, summary strip pins memory first with `!!HOT` and recommends using `/dashboard --detailed`.
- `/status`: Show runtime status for model, memory, permissions, feature flags, and latest turn summary.
- `/diag`: Show memory diagnostics counters.
- `/diag --json`: Export memory diagnostics as JSON (for CI/gating).
- `/metrics dream`: Show memory-dream operational metrics (completion/skip rates, reason-code histogram, average writes).
- `/model`: Show active LLM model policy (source, fallback, retries, aliases).
- `/model set <value>`: Set preferred model alias or explicit model name (validated against allowlist).
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
> /dashboard                         # Render dashboard snapshot on demand
> /dashboard --compact               # Render a condensed dashboard snapshot
> /dashboard --detailed              # Render a fuller dashboard snapshot
> /status                            # Inspect runtime status panel
> /diag                              # View memory diagnostics
> /diag --json                       # Export diagnostics in JSON
> /metrics dream                     # Inspect memory-dream operational metrics
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

### Session history window standardization

The assistant maintains a standardized session history window using a **two-layer gating strategy**:

**Storage layer**: `SessionMemoryStore` enforces a fixed-size circular buffer
- Default window: 10 entries (last 10 turns)
- Configured per session at instantiation time via `historyWindowSize` parameter
- When limit is exceeded, oldest entries are automatically evicted (FIFO)
- Prevents unbounded memory growth across long sessions

**Retrieval layer**: `MemoryCoordinator.retrieveForLLM()` applies optional secondary limiting
- Default retrieval limit: 10 entries (aligns with storage window)
- Configurable per call via `options.historyLimit` parameter
- Enables temporary expansion (e.g., for fuller context injection) when needed
- Edge case: `historyLimit: 0` returns empty history (no entries sent to LLM)

**Example: Two-layer window in action**

```typescript
// Storage enforces max 10 entries
const coordinator = createMemoryCoordinator(persistent, preferences)

// Push 20 entries => storage keeps only last 10
for (let i = 0; i < 20; i++) {
  coordinator.session.pushHistory(sessionId, { input: `q-${i}`, response: `r-${i}` })
}

// Default retrieval: last 10 entries
const bundle1 = coordinator.retrieveForLLM(sessionId)
console.log(bundle1.history.length) // 10

// Retrieve only last 3 entries
const bundle2 = coordinator.retrieveForLLM(sessionId, { historyLimit: 3 })
console.log(bundle2.history.length) // 3

// Retrieve zero entries
const bundle3 = coordinator.retrieveForLLM(sessionId, { historyLimit: 0 })
console.log(bundle3.history.length) // 0
```

**Design rationale**

- **Storage window**: Guarantees predictable mem usage (constant space per session)
- **Retrieval limit**: Allows LLM context tuning without changing stored history
- **Isolation**: Each session maintains its own independent window
- **Ordering**: History maintains insertion order (oldest to newest, FIFO eviction)

### Optional UI feature flags

Feature flags are provided through `FEATURE_FLAGS` as a comma-separated list.

- `verbose_diag`: enrich `/diag` output with ranked facts and active model details
- `ui_tui_mvp`: render a read-only terminal dashboard around the current REPL loop
- `coordinator_mode`: enable coordinator research+synthesis path for complex non-tool inputs
- `memory_dream`: enable periodic memory dream consolidation and observability events
- `verbose_tools`: emit verbose tool-call diagnostics for replay/debug analysis

Example:

```bash
export FEATURE_FLAGS="ui_tui_mvp,verbose_diag"
npm run dev
```

### LLM integration (optional)

- Set `OPENAI_API_KEY` to enable model responses for non-tool prompts.
- Optional: set `OPENAI_MODEL` (default policy alias: `balanced` -> `gpt-4o-mini`).
- Optional: set `OPENAI_BASE_URL` to use a compatible gateway endpoint.
- Optional: set `OPENAI_FALLBACK_MODEL` for automatic fallback when primary model is unavailable.
- Optional: set `OPENAI_ALLOWED_MODELS` as a comma-separated allowlist policy
	(default: `gpt-4o-mini,gpt-4.1,gpt-4o`).
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

### Unified LLM context injection

The assistant uses a **unified context bundle structure** for LLM integration, combining all available context into a single `LLMContextBundle` object:

```typescript
type LLMContextBundle = {
  context: ContextSnapshot              // Project metadata (cwd, platform, timestamp)
  preferences: Array<{key, value}>      // User stored preferences
  history: HistoryEntry[]               // Recent conversation history (windowed)
  persistentFacts: Array<{key, value, confidence, updatedAt}>  // Ranked facts
}
```

**Injection flow:**
1. `runTurn()` calls `memory.buildLLMContextBundle(sessionId)` to assemble all context
2. Bundle is passed to injected `llmResponder` along with `input`, `sessionId`, `turnId`, `rememberedLastEcho`
3. OpenAI responder (or custom responder) extracts context, preferences, history, facts and constructs system prompt
4. LLM receives rich context in single structured unit

**Benefits:**
- **Clarity**: Single context object replaces scattered parameters
- **Consistency**: All LLM calls receive the same context shape
- **Flexibility**: Custom responders can easily access all needed context
- **Testing**: Single bundle reduces mock complexity in unit tests

**Example LLM responder implementation:**

```typescript
const openaiResponder = createOpenAIResponder(options)
const result = await runTurn(input, repository, memory, permissionRepo, sessionId, {
  llmResponder: async (args) => {
    const { input, contextBundle, rememberedLastEcho } = args
    const { context, preferences, history, persistentFacts } = contextBundle
    
    // Build system prompt from context bundle
    const systemPrompt = buildPrompt(context, preferences, persistentFacts)
    
    // Inject history as conversation turns
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.flatMap(h => [
        { role: 'user', content: h.input },
        { role: 'assistant', content: h.response },
      ]),
      { role: 'user', content: input },
    ]
    
    return openaiResponder({ /* OpenAI API call */ })
  },
})
```

### Confidence-based memory write-back hardening

The assistant implements **write-decision gating** for persistent memory to prevent low-confidence facts from corrupting the knowledge base:

**Write-decision policy:**
- Each persistent write is evaluated against minimum confidence thresholds
- Key-specific thresholds (e.g., `last_echo_output` requires 0.7 confidence)
- Default threshold for unknown keys: 0.5 confidence
- Bookkeeping keys (prefix `__`) bypass confidence checks

**Audit trail:**
- Every write decision is recorded: allowed or rejected, with reason
- Tracks: timestamp, key, value, proposed confidence, decision result
- Accessible via `memory.getWriteAuditTrail()` for inspection
- Bounded to 1000 entries to prevent memory bloat

**Write-decision observability in diagnostics:**
- `/diag` outputs write-decision counts (total / allowed / rejected)
- `/diag` outputs write acceptance rate as a percentage
- `/status` panel shows write-decision summary (total + acceptance rate)
- Dashboard memory panel shows write-decision row in detailed mode
- New fields on `MemoryDiagnostics`:
  - `writeDecisionsTotal` / `writeDecisionsAllowed` / `writeDecisionsRejected`
  - `writeDecisionAcceptanceRate` (0–1, 1.0 = perfect when no decisions made)

**Example write-decision flow:**

```typescript
const coordinator = createMemoryCoordinator(persistent, preferences)

// Evaluate before writing
const decision = coordinator.evaluatePersistentWrite(
  'user_inference',      // key
  'user prefers_async',  // value
  0.65,                  // confidence (0-1)
)

if (decision.allowed) {
  // High confidence: proceed with write
  persistent.set('user_inference', 'user prefers_async', 0.65)
} else {
  // Low confidence: reject or log
  console.log(`Write rejected: ${decision.reason}`)
  
  // Inspect audit trail
  const trail = coordinator.getWriteAuditTrail()
  const recentDecisions = trail.getRecent(5)
  const keyHistory = trail.getByKey('user_inference', 10)
}
```

**Safety guarantees:**
- Prevents accumulation of uncertain facts
- Traces all write decisions for post-hoc analysis
- Supports consolidation safety inspection
- Enables confidence monitoring for memory health

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
