import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { launchApp } from './helpers/app'
import { createTask } from './helpers/tasks'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

test('default group "Rundown" exists on first launch', async () => {
  ;({ app, page } = await launchApp())

  // The group selector trigger should show "Rundown"
  const trigger = page.getByTestId('group-selector-trigger')
  await expect(trigger).toHaveText(/Rundown/)
})

test('create a new group and switch to it', async () => {
  ;({ app, page } = await launchApp())

  // Open the group selector
  await page.getByTestId('group-selector-trigger').click()
  await expect(page.getByTestId('group-selector-dropdown')).toBeVisible()

  // Click "New Group"
  await page.getByTestId('new-group-button').click()

  // Type group name and confirm
  const input = page.getByTestId('new-group-input')
  await input.fill('Work Tasks')
  await input.press('Enter')

  // Dropdown should close and new group should be active
  await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Work Tasks/)
})

test('tasks are scoped to the active group', async () => {
  ;({ app, page } = await launchApp())

  // Create a task in the default group
  await createTask(page, 'Default group task')
  await expect(page.locator('[data-task-description="Default group task"]')).toBeVisible()

  // Create a new group
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill('Other Group')
  await page.getByTestId('new-group-input').press('Enter')

  // New group should be empty
  await expect(page.getByTestId('empty-task-list')).toBeVisible()
  await expect(page.locator('[data-task-description="Default group task"]')).not.toBeVisible()

  // Create a task in the new group
  await createTask(page, 'Other group task')
  await expect(page.locator('[data-task-description="Other group task"]')).toBeVisible()

  // Switch back to default group
  await page.getByTestId('group-selector-trigger').click()
  await page.getByText('Rundown').click()

  // Only the default group task should be visible
  await expect(page.locator('[data-task-description="Default group task"]')).toBeVisible()
  await expect(page.locator('[data-task-description="Other group task"]')).not.toBeVisible()
})

test('switch between groups', async () => {
  ;({ app, page } = await launchApp())

  // Create task in default group
  await createTask(page, 'Task A')

  // Create new group
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill('Group B')
  await page.getByTestId('new-group-input').press('Enter')

  // Create task in Group B
  await createTask(page, 'Task B')

  // Switch to default group via dropdown
  await page.getByTestId('group-selector-trigger').click()
  await page.getByText('Rundown').click()

  await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Rundown/)
  await expect(page.locator('[data-task-description="Task A"]')).toBeVisible()
  await expect(page.locator('[data-task-description="Task B"]')).not.toBeVisible()
})

test('delete a group removes its tasks', async () => {
  ;({ app, page } = await launchApp())

  // Create a task in default group
  await createTask(page, 'Keep this')

  // Create second group with a task
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill('To Delete')
  await page.getByTestId('new-group-input').press('Enter')

  await createTask(page, 'Delete me')
  await expect(page.locator('[data-task-description="Delete me"]')).toBeVisible()

  // Open dropdown and delete "To Delete" group
  await page.getByTestId('group-selector-trigger').click()
  const dropdown = page.getByTestId('group-selector-dropdown')
  // Find the group row containing "To Delete" inside the dropdown
  const groupRow = dropdown.locator('[data-testid^="group-item-"]', { hasText: 'To Delete' })
  await groupRow.hover()
  await groupRow.locator('[data-testid^="delete-group-"]').click()

  // Confirmation dialog should appear
  await expect(page.getByText('Delete group')).toBeVisible()
  await page.getByTestId('confirm-delete-group').click()

  // Should switch to the remaining group
  await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Rundown/)
  await expect(page.locator('[data-task-description="Keep this"]')).toBeVisible()
})

test('cannot delete the last remaining group', async () => {
  ;({ app, page } = await launchApp())

  // Open dropdown — the only group should not have a delete button
  await page.getByTestId('group-selector-trigger').click()
  const dropdown = page.getByTestId('group-selector-dropdown')
  await expect(dropdown.locator('[data-testid^="delete-group-"]')).not.toBeVisible()
})

test('active group persists across restart', async () => {
  const sharedStorePath = mkdtempSync(path.join(tmpdir(), 'rundown-store-'))

  ;({ app, page } = await launchApp('idle', sharedStorePath))

  // Create a new group
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill('Persistent Group')
  await page.getByTestId('new-group-input').press('Enter')

  await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Persistent Group/)

  // Create a task so we can verify group content after restart
  await createTask(page, 'Survives restart')

  // Restart
  await app.close()
  ;({ app, page } = await launchApp('idle', sharedStorePath))

  // Active group should still be "Persistent Group"
  await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Persistent Group/)
  await expect(page.locator('[data-task-description="Survives restart"]')).toBeVisible()
})

test('task count reflects only active group', async () => {
  ;({ app, page } = await launchApp())

  // Create 2 tasks in default group
  await createTask(page, 'Task 1')
  await createTask(page, 'Task 2')

  // Footer shows "2 tasks"
  await expect(page.getByText('2 tasks')).toBeVisible()

  // Create new group with 1 task
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill('Small Group')
  await page.getByTestId('new-group-input').press('Enter')

  await createTask(page, 'Solo task')

  // Footer shows "1 task"
  await expect(page.getByText('1 task')).toBeVisible()
})

test('group selector shows task count per group', async () => {
  ;({ app, page } = await launchApp())

  // Create tasks in default group
  await createTask(page, 'T1')
  await createTask(page, 'T2')

  // Open dropdown and check count next to Rundown
  await page.getByTestId('group-selector-trigger').click()
  const dropdown = page.getByTestId('group-selector-dropdown')

  // The Rundown group row should show "2" count
  const rundownRow = dropdown.locator('[data-testid^="group-item-"]').first()
  await expect(rundownRow).toContainText('2')
})
