import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { clickTask } from './helpers/tasks'
import { createTaskWithDir, startSession } from './helpers/sessions'

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

test.describe('shell tabs', () => {
  test('add shell tab button is visible when directory is set', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Shell task', tempDirs)
    await expect(page.getByTestId('add-shell-tab')).toBeVisible()
  })

  test('clicking + opens a shell terminal tab', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Shell task', tempDirs)

    await page.getByTestId('add-shell-tab').click()

    // Shell tab appears
    await expect(page.getByTestId('tab-shell-1')).toBeVisible()
    await expect(page.getByTestId('tab-shell-1')).toHaveText(/Shell 1/)

    // Terminal panel is shown for the shell
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
  })

  test('can open multiple shell tabs', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Multi shell', tempDirs)

    await page.getByTestId('add-shell-tab').click()
    await page.getByTestId('add-shell-tab').click()
    await page.getByTestId('add-shell-tab').click()

    await expect(page.getByTestId('tab-shell-1')).toBeVisible()
    await expect(page.getByTestId('tab-shell-2')).toBeVisible()
    await expect(page.getByTestId('tab-shell-3')).toBeVisible()
  })

  test('close button removes the shell tab', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Close shell', tempDirs)

    await page.getByTestId('add-shell-tab').click()
    await expect(page.getByTestId('tab-shell-1')).toBeVisible()

    // Hover to reveal close button, then click
    await page.getByTestId('tab-shell-1').hover()
    await page.getByTestId('close-shell-1').click({ force: true })

    await expect(page.getByTestId('tab-shell-1')).not.toBeVisible()
  })

  test('closing active shell tab switches back to Claude', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Switch back', tempDirs)
    await startSession(page)

    await page.getByTestId('add-shell-tab').click()

    // Shell tab is active
    await expect(page.getByTestId('tab-shell-1')).toBeVisible()

    // Close it
    await page.getByTestId('tab-shell-1').hover()
    await page.getByTestId('close-shell-1').click({ force: true })

    // Claude tab should be active again (terminal panel still visible from Claude session)
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
    await expect(page.getByTestId('tab-terminal')).toHaveClass(/text-primary/)
  })

  test('shell tabs are independent per task', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Task A', tempDirs)
    await createTaskWithDir(app, page, 'Task B', tempDirs)

    // Add shell to Task A
    await clickTask(page, 'Task A')
    await page.getByTestId('add-shell-tab').click()
    await expect(page.getByTestId('tab-shell-1')).toBeVisible()

    // Switch to Task B — no shell tabs
    await clickTask(page, 'Task B')
    await expect(page.getByTestId('tab-shell-1')).not.toBeVisible()

    // Switch back to Task A — shell tab still there
    await clickTask(page, 'Task A')
    await expect(page.getByTestId('tab-shell-1')).toBeVisible()
  })

  test('shell tab works alongside active Claude session', async () => {
    ;({ app, page } = await launchApp('idle'))
    await createTaskWithDir(app, page, 'Both tabs', tempDirs)
    await startSession(page)

    // Open a shell tab
    await page.getByTestId('add-shell-tab').click()
    await expect(page.getByTestId('terminal-panel')).toBeVisible()

    // Switch back to Claude tab
    await page.getByTestId('tab-terminal').click()
    await expect(page.getByTestId('terminal-panel')).toBeVisible()

    // Switch to shell tab
    await page.getByTestId('tab-shell-1').click()
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
  })
})
