import { getUtilityCommandRegistry } from '../commands/utilityRegistry.js'

const REGISTERED_UTILITY_LINES = getUtilityCommandRegistry()
  .map(item => `  ${item.command.padEnd(24)}${item.description}`)
  .join('\n')

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
${REGISTERED_UTILITY_LINES}

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

const REGISTERED_UTILITY_COMMANDS = getUtilityCommandRegistry().map(item => item.command)

export const COMMAND_LIST = [
  'echo <text>',
  'search <query>',
  'read <file>',
  'set preference <key> <value>',
  'get preference <key>',
  'recall last echo',
  ...REGISTERED_UTILITY_COMMANDS,
]
