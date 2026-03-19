import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { clickTask } from './helpers/tasks'
import { createTaskWithDir, startSession, stopSession } from './helpers/sessions'

let app: ElectronApplication
let page: Page
let tempDirs: string[] = []

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

async function createGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill(name)
  await page.getByTestId('new-group-input').press('Enter')
}

async function switchToGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  const dropdown = page.getByTestId('group-selector-dropdown')
  await dropdown.locator('[data-testid^="group-item-"]', { hasText: name }).click()
}

function terminalText(page: Page): ReturnType<typeof page.locator> {
  return page.locator('[data-testid="terminal-panel"] .xterm-rows')
}

test.describe('terminal output buffering', () => {
  test('terminal output survives group switch', async () => {
    ;({ app, page } = await launchApp('echo'))

    await createTaskWithDir(app, page, 'Buffer task', tempDirs)
    await startSession(page)

    // Type into terminal and wait for echo
    await page.keyboard.type('hello buffer')
    await page.keyboard.press('Enter')
    await expect(terminalText(page)).toContainText('> hello buffer', { timeout: 5000 })

    // Switch to a different group (unmounts TerminalPanel)
    await createGroup(page, 'Other')

    // Switch back
    await switchToGroup(page, 'Rundown')
    await clickTask(page, 'Buffer task')

    // Terminal should still show the echoed text
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
    await expect(terminalText(page)).toContainText('> hello buffer', { timeout: 5000 })
  })

  test('terminal output survives task deselection', async () => {
    ;({ app, page } = await launchApp('echo'))

    await createTaskWithDir(app, page, 'Task A', tempDirs)
    await createTaskWithDir(app, page, 'Task B', tempDirs)

    // Start session on Task A
    await clickTask(page, 'Task A')
    await startSession(page)

    // Type and verify echo
    await page.keyboard.type('task a output')
    await page.keyboard.press('Enter')
    await expect(terminalText(page)).toContainText('> task a output', { timeout: 5000 })

    // Switch to Task B (unmounts Task A's TerminalPanel)
    await clickTask(page, 'Task B')

    // Switch back to Task A
    await clickTask(page, 'Task A')

    // Terminal should still show the echoed text
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
    await expect(terminalText(page)).toContainText('> task a output', { timeout: 5000 })
  })

  test('buffer cleared after session kill', async () => {
    ;({ app, page } = await launchApp('echo'))

    await createTaskWithDir(app, page, 'Kill task', tempDirs)
    await startSession(page)

    // Type and verify echo
    await page.keyboard.type('old output')
    await page.keyboard.press('Enter')
    await expect(terminalText(page)).toContainText('> old output', { timeout: 5000 })

    // Stop session (kills PTY + disposes headless terminal)
    await stopSession(page)

    // Start new session
    await startSession(page)

    // Terminal should NOT show old output
    const text = await terminalText(page).textContent()
    expect(text).not.toContain('> old output')
  })
})
