import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { launchApp } from './helpers/app'
import {
  createTask,
  editTaskDescription,
  deleteTask,
  addSubtask,
  markTaskDone,
  clickTask
} from './helpers/tasks'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

test('create a task', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'My first task')

  const taskItem = page.locator('[data-task-description="My first task"]')
  await expect(taskItem).toBeVisible()
})

test('edit task description', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Original description')
  await editTaskDescription(page, 'Original description', 'Updated description')

  await expect(page.locator('[data-task-description="Updated description"]')).toBeVisible()
  await expect(page.locator('[data-task-description="Original description"]')).not.toBeVisible()
})

test('delete a task', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Task to delete')
  await expect(page.locator('[data-task-description="Task to delete"]')).toBeVisible()

  await deleteTask(page, 'Task to delete')

  await expect(page.locator('[data-task-description="Task to delete"]')).not.toBeVisible()
})

test('create nested sub-tasks up to 5 levels', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Level 0')
  await addSubtask(page, 'Level 0', 'Level 1')
  await addSubtask(page, 'Level 1', 'Level 2')
  await addSubtask(page, 'Level 2', 'Level 3')
  await addSubtask(page, 'Level 3', 'Level 4')

  // All 5 levels should be visible
  for (const level of ['Level 0', 'Level 1', 'Level 2', 'Level 3', 'Level 4']) {
    await expect(page.locator(`[data-task-description="${level}"]`)).toBeVisible()
  }

  // Level 4 (depth=4, the 5th level) should NOT have an "add subtask" button
  await page.locator('[data-task-description="Level 4"]').hover()
  await expect(
    page.locator('[data-task-description="Level 4"]').getByTestId('add-subtask')
  ).not.toBeVisible()
})

test('mark as done transitions directly (no confirmation dialog)', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Task to complete')

  const taskItem = page.locator('[data-task-description="Task to complete"]')
  await expect(taskItem).toHaveAttribute('data-task-state', 'idle')

  await markTaskDone(page, 'Task to complete')

  await expect(taskItem).toHaveAttribute('data-task-state', 'done')
})

test('persistence across restart', async () => {
  const sharedStorePath = mkdtempSync(path.join(tmpdir(), 'rundown-store-'))

  ;({ app, page } = await launchApp('idle', sharedStorePath))

  await createTask(page, 'Persistent task')
  await expect(page.locator('[data-task-description="Persistent task"]')).toBeVisible()

  // Close and relaunch with the same store path
  await app.close()
  ;({ app, page } = await launchApp('idle', sharedStorePath))

  await expect(page.locator('[data-task-description="Persistent task"]')).toBeVisible()
})

test('click task navigates to detail view', async () => {
  ;({ app, page } = await launchApp())

  // Initially shows "Select a task" placeholder
  await expect(page.getByTestId('no-task-selected')).toBeVisible()

  await createTask(page, 'Clickable task')
  await clickTask(page, 'Clickable task')

  // Detail view shows task info and "No active session" placeholder
  await expect(page.getByTestId('task-detail-title')).toHaveText('Clickable task')
  await expect(page.getByTestId('no-active-session')).toBeVisible()
})
