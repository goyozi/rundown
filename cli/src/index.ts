import { reportSession } from './commands/report-session'

const command = process.argv[2]

if (command === 'report-session') {
  await reportSession()
} else {
  console.error(`Usage: rundown-cli <command>

Commands:
  report-session  Report a Claude Code session ID to Rundown`)
  process.exit(0)
}
