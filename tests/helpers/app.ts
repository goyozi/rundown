import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'

export async function launchApp(
  stubScript = 'idle',
  storePath?: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const effectiveStorePath = storePath ?? mkdtempSync(path.join(tmpdir(), 'rundown-store-'))

  const app = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      CLAUDE_BIN: path.resolve('tests/fixtures/claude-stub.js'),
      CLAUDE_STUB_SCRIPT: stubScript,
      SHELL_BIN: path.resolve('tests/fixtures/shell-stub.js'),
      ELECTRON_STORE_PATH: effectiveStorePath,
      RUNDOWN_HEADLESS: process.env.RUNDOWN_HEADLESS ?? '1'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}
