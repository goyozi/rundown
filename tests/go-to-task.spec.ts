import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { launchApp } from './helpers/app'
import { createTask } from './helpers/tasks'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

async function createGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill(name)
  await page.getByTestId('new-group-input').press('Enter')
}

async function switchToGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByText(name).click()
  // Wait for the popover to close before proceeding
  await page.getByTestId('group-selector-dropdown').waitFor({ state: 'hidden' })
}

async function openGoToTask(page: Page): Promise<void> {
  await page.keyboard.press('Meta+p')
  await expect(page.getByTestId('go-to-task-overlay')).toBeVisible()
  // Ensure the input is focused before proceeding
  await page.getByTestId('go-to-task-input').waitFor({ state: 'visible' })
  await page.getByTestId('go-to-task-input').focus()
}

test.describe('Go to Task command palette', () => {
  test('opens with ⌘P and closes with Escape', async () => {
    ;({ app, page } = await launchApp())

    await openGoToTask(page)

    const input = page.getByTestId('go-to-task-input')
    await expect(input).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('opens by clicking the trigger', async () => {
    ;({ app, page } = await launchApp())

    await page.getByTestId('go-to-task-trigger').click()
    await expect(page.getByTestId('go-to-task-overlay')).toBeVisible()
  })

  test('searches and selects a task', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Fix login bug')
    await createTask(page, 'Add dashboard')

    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('login')

    const results = page.getByTestId('go-to-task-result')
    await expect(results).toHaveCount(1)
    await expect(results.first()).toContainText('Fix login bug')

    await page.keyboard.press('Enter')
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('navigates to task in different group', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task in default group')

    await createGroup(page, 'Other Group')
    await createTask(page, 'Remote task')

    // Switch back to default group
    await switchToGroup(page, 'Rundown')
    await expect(page.locator('[data-task-description="Task in default group"]')).toBeVisible()

    // Use Go to Task to jump to the other group's task
    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('Remote')

    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toContainText('Remote task')
    await page.keyboard.press('Enter')

    // Should have switched groups and selected the task
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Other Group/)
    await expect(page.locator('[data-task-description="Remote task"]')).toBeVisible()
  })

  test('multi-token search matches across group and task name', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Go to bar')

    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('Run Go')

    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toContainText('Go to bar')
  })

  test('closes when clicking backdrop', async () => {
    ;({ app, page } = await launchApp())

    await openGoToTask(page)

    // Click the backdrop (top-left corner, away from the dropdown)
    await page.getByTestId('go-to-task-overlay').click({ position: { x: 10, y: 400 } })
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('keyboard navigation through results', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Alpha task')
    await createTask(page, 'Beta task')

    await openGoToTask(page)

    // First result should be highlighted by default
    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')

    // Arrow down to second result
    await page.keyboard.press('ArrowDown')
    await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true')

    // Arrow up back to first
    await page.keyboard.press('ArrowUp')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
  })
})
