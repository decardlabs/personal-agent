export const HELP_TEXT = `
╔════════════════════════════════════════════════════════════════╗
║              Personal Assistant - Command Reference            ║
╚════════════════════════════════════════════════════════════════╝

📜 BASIC COMMANDS:
  echo <text>              Echo text back (remembers last output)
  search <query>           Search project files for keyword matches
  read <file>              Read file contents (or: read file <path>)

📋 PREFERENCE COMMANDS:
  set preference <k> <v>   Store user preference (persisted)
  get preference <k>       Retrieve preference value
  
🏆 MEMORY COMMANDS:
  recall last echo         Show the last echoed text (cross-session)

⚙️  UTILITIES:
  /help                    Show this help message
  /history                 Show project history (session-first, deduped)
  /history --all           Show project history (latest 50, raw order)
  /clear-history           Clear saved command history
  /memory                  Show current memory snapshot summary
  /memory --detailed       Show summary with top persistent facts
  /diag                    Show runtime memory diagnostics
  /diag --json             Output diagnostics in JSON for CI/gating
  /why                     Explain memory signals used in the latest turn
  /why --json              Output latest memory-usage explanation in JSON
  /consolidate-memory      Prune stale low-confidence persistent memory
  /consolidate-memory --auto  Consolidate only when diagnostics suggest it
  exit, quit               Leave interactive mode

🔐 PERMISSION:
  --approve-risky          Flag to auto-approve risky commands
                           (run: npm run dev --approve-risky -- <cmd>)

📌 EXAMPLES:
  > echo hello world
  > search runTurn
  > read src/package.json
  > set preference lang python
  > get preference lang
  > recall last echo

💡 TIP: In interactive mode, use /history to browse your commands!
`

export const QUICK_HELP = `Type /help for full command reference`

export const COMMAND_LIST = [
  'echo <text>',
  'search <query>',
  'read <file>',
  'set preference <key> <value>',
  'get preference <key>',
  'recall last echo',
  '/help',
  '/history',
  '/history --all',
  '/clear-history',
  '/memory',
  '/memory --detailed',
  '/diag',
  '/diag --json',
  '/why',
  '/consolidate-memory',
  '/consolidate-memory --auto',
  'exit',
  'quit',
]
