import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { launchApp } from './helpers/app'
import { addShortcut, getShortcutButtons, deleteShortcut, editShortcut } from './helpers/shortcuts'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

async function openGoToTask(page: Page): Promise<void> {
  await page.keyboard.press('Meta+p')
  await expect(page.getByTestId('go-to-task-overlay')).toBeVisible()
  await page.getByTestId('go-to-task-input').waitFor({ state: 'visible' })
  await page.getByTestId('go-to-task-input').focus()
}

test.describe('shortcuts', () => {
  test('shows add shortcut button when no shortcuts exist', async () => {
    ;({ app, page } = await launchApp())

    await expect(page.getByTestId('add-shortcut-button')).toBeVisible()
  })

  test('can add a shell shortcut', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, { name: 'Run tests', type: 'shell', command: 'pnpm test' })

    const buttons = getShortcutButtons(page)
    await expect(buttons).toHaveCount(1)
    await expect(buttons.first()).toHaveAttribute('title', 'Run tests')
  })

  test('can add a claude shortcut', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, {
      name: 'Fix lint',
      type: 'claude',
      command: 'Fix all lint errors in this repo'
    })

    const buttons = getShortcutButtons(page)
    await expect(buttons).toHaveCount(1)
    await expect(buttons.first()).toHaveAttribute('title', 'Fix lint')
  })

  test('shortcut button shows tooltip on hover', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, { name: 'My shortcut', command: 'echo hello' })

    const btn = page.locator('[data-testid="shortcut-button"][title="My shortcut"]')
    await btn.hover()

    // The tooltip renders the shortcut name
    await expect(page.getByText('My shortcut')).toBeVisible()
  })

  test('can delete a shortcut via context menu', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, { name: 'To delete', command: 'echo bye' })
    await expect(getShortcutButtons(page)).toHaveCount(1)

    await deleteShortcut(page, 'To delete')

    await expect(getShortcutButtons(page)).toHaveCount(0)
  })

  test('can edit a shortcut', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, { name: 'Old name', command: 'echo old' })

    await editShortcut(page, 'Old name')

    // Dialog should be pre-populated — update name and command
    const nameInput = page.getByTestId('shortcut-name-input')
    await expect(nameInput).toHaveValue('Old name')

    await nameInput.fill('New name')
    await page.getByTestId('shortcut-command-input').fill('echo new')

    await page.getByTestId('shortcut-save-button').click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })

    await expect(
      page.locator('[data-testid="shortcut-button"][title="New name"]')
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="shortcut-button"][title="Old name"]')
    ).not.toBeVisible()
  })

  test('shortcuts appear in command palette', async () => {
    ;({ app, page } = await launchApp())

    await addShortcut(page, { name: 'Deploy prod', command: 'pnpm deploy' })

    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('Deploy')

    const shortcutResults = page.getByTestId('go-to-task-shortcut-result')
    await expect(shortcutResults).toHaveCount(1)
    await expect(shortcutResults.first()).toContainText('Deploy prod')
    await expect(shortcutResults.first()).toContainText('Run')
  })

  test('shortcuts persist across restarts', async () => {
    const sharedStorePath = mkdtempSync(path.join(tmpdir(), 'rundown-store-'))

    ;({ app, page } = await launchApp('idle', sharedStorePath))

    await addShortcut(page, { name: 'Persistent shortcut', command: 'echo persist' })
    await expect(getShortcutButtons(page)).toHaveCount(1)

    await app.close()
    ;({ app, page } = await launchApp('idle', sharedStorePath))

    const buttons = getShortcutButtons(page)
    await expect(buttons).toHaveCount(1)
    await expect(buttons.first()).toHaveAttribute('title', 'Persistent shortcut')
  })

  test('add button becomes subtle after first shortcut', async () => {
    ;({ app, page } = await launchApp())

    // Prominent button visible before any shortcuts
    await expect(page.getByTestId('add-shortcut-button')).toBeVisible()

    await addShortcut(page, { name: 'First shortcut', command: 'echo first' })

    // Prominent button gone, only the icon button remains
    await expect(page.getByTestId('add-shortcut-button')).not.toBeVisible()
    await expect(page.getByTestId('add-shortcut-icon-button')).toBeVisible()
  })
})
