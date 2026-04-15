import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

test.describe('Back/Forward Navigation', () => {
  test('back and forward buttons navigate through history', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Back button should be enabled, forward disabled
    await expect(page.getByTestId('nav-back')).toBeEnabled()
    await expect(page.getByTestId('nav-forward')).toBeDisabled()

    // Go back to B
    await page.getByTestId('nav-back').click()
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task B')

    // Go back to A
    await page.getByTestId('nav-back').click()
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task A')

    // Forward should now be enabled
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // Go forward to B
    await page.getByTestId('nav-forward').click()
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task B')
  })

  test('CMD+[ and CMD+] work as back/forward shortcuts', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')

    // CMD+[ to go back
    await page.keyboard.press('Meta+[')
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task A')
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // CMD+] to go forward
    await page.keyboard.press('Meta+]')
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task B')
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })

  test('new navigation clears forward stack', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Go back to B
    await page.keyboard.press('Meta+[')
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // Navigate to a new task — forward should be cleared
    await clickTask(page, 'Task A')
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })

  test('buttons are disabled with no history', async () => {
    ;({ app, page } = await launchApp())

    await expect(page.getByTestId('nav-back')).toBeDisabled()
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })
})

test.describe('CMD+E Recent Task Switcher', () => {
  test('opens and cycles through recent tasks', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Wait for navigation state to settle (back-stack has entries)
    await expect(page.getByTestId('nav-back')).toBeEnabled()

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')

    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // First item (Task B) should be highlighted
    const results = page.getByTestId('recent-task-result')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
    await expect(results.first()).toContainText('Task B')

    // Release CMD to commit — should navigate to Task B
    await page.keyboard.up('Meta')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task B')
  })

  test('does not open with no history', async () => {
    ;({ app, page } = await launchApp())

    await page.keyboard.press('Meta+e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
  })

  test('escape cancels without navigating', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')

    // Wait for navigation state to settle
    await expect(page.getByTestId('nav-back')).toBeEnabled()

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // Escape to cancel
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()

    // Should still be on Task B (no navigation happened)
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task B')
    await page.keyboard.up('Meta')
  })

  test('clicking an item navigates to it', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Wait for navigation state to settle
    await expect(page.getByTestId('nav-back')).toBeEnabled()

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // Click Task A in the list
    const results = page.getByTestId('recent-task-result')
    await results.filter({ hasText: 'Task A' }).click()

    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
    await expect(page.getByTestId('task-detail-title')).toHaveText('Task A')
    await page.keyboard.up('Meta')
  })
})
