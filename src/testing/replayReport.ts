import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { replayCases } from './replayCases.js'
import {
  formatReplaySuiteSummary,
  runReplaySuite,
} from './replayRunner.js'

function parseJsonOutputPath(argv: string[]): string | null {
  const jsonFlagIndex = argv.findIndex(arg => arg === '--json')
  if (jsonFlagIndex === -1) {
    return null
  }

  const next = argv[jsonFlagIndex + 1]
  if (!next || next.startsWith('--')) {
    throw new Error('Missing value for --json. Example: --json reports/replay-summary.json')
  }

  return resolve(process.cwd(), next)
}

async function main(): Promise<void> {
  const jsonOutputPath = parseJsonOutputPath(process.argv.slice(2))
  const summary = await runReplaySuite(replayCases)
  console.log(formatReplaySuiteSummary(summary))

  if (jsonOutputPath) {
    mkdirSync(dirname(jsonOutputPath), { recursive: true })
    writeFileSync(jsonOutputPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(`Replay JSON report written to ${jsonOutputPath}`)
  }

  if (summary.failedCases > 0) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('Failed to run replay report', error)
  process.exit(1)
})
