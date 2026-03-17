#!/usr/bin/env node
// Simulates a user shell for testing shell tabs.
// Prints a prompt and echoes input back, stays alive until killed.
process.stdout.write('cwd:' + process.cwd() + ':endcwd\n')
process.stdout.write('shell$ ')
process.stdin.on('data', (d) => process.stdout.write(`> ${d}`))
process.stdin.resume()
