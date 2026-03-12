#!/usr/bin/env node
// Simulates a Claude Code session for testing.
// Reads CLAUDE_STUB_SCRIPT env var to pick a behaviour preset.
const preset = process.env.CLAUDE_STUB_SCRIPT ?? 'echo'

switch (preset) {
  case 'echo':
    // Immediately echo whatever is typed on stdin, then stay open.
    process.stdin.on('data', (d) => process.stdout.write(`> ${d}`))
    break

  case 'idle':
    // Print a prompt and do nothing. Useful for testing "session active" UI.
    process.stdout.write('claude> ')
    break

  case 'apply-feedback':
    // Print a canned "applying changes" response when any input arrives.
    process.stdin.once('data', () => {
      process.stdout.write('Got your feedback. Applying changes...\n')
      setTimeout(() => process.stdout.write('Done.\n'), 300)
    })
    break
}
// Never exits on its own — tests kill it via Stop Session.
