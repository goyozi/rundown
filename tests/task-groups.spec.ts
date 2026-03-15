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

async function createGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill(name)
  await page.getByTestId('new-group-input').press('Enter')
}

async function switchToGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByText(name).click()
}

test.describe('group lifecycle', () => {
  test('default group "Rundown" exists on first launch', async () => {
    ;({ app, page } = await launchApp())

    const trigger = page.getByTestId('group-selector-trigger')
    await expect(trigger).toHaveText(/Rundown/)
  })

  test('create a new group and switch to it', async () => {
    ;({ app, page } = await launchApp())

    await createGroup(page, 'Work Tasks')

    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Work Tasks/)
  })

  test('delete a group removes its tasks', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Keep this')

    await createGroup(page, 'To Delete')

    await createTask(page, 'Delete me')
    await expect(page.locator('[data-task-description="Delete me"]')).toBeVisible()

    await page.getByTestId('group-selector-trigger').click()
    const dropdown = page.getByTestId('group-selector-dropdown')
    const groupRow = dropdown.locator('[data-testid^="group-item-"]', { hasText: 'To Delete' })
    await groupRow.hover()
    await groupRow.locator('[data-testid^="delete-group-"]').click()

    await expect(page.getByText('Delete group')).toBeVisible()
    await page.getByTestId('confirm-delete-group').click()

    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Rundown/)
    await expect(page.locator('[data-task-description="Keep this"]')).toBeVisible()
  })

  test('cannot delete the last remaining group', async () => {
    ;({ app, page } = await launchApp())

    await page.getByTestId('group-selector-trigger').click()
    const dropdown = page.getByTestId('group-selector-dropdown')
    await expect(dropdown.locator('[data-testid^="delete-group-"]')).not.toBeVisible()
  })
})

test.describe('task scoping', () => {
  test('tasks are scoped to the active group', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Default group task')
    await expect(page.locator('[data-task-description="Default group task"]')).toBeVisible()

    await createGroup(page, 'Other Group')

    await expect(page.getByTestId('empty-task-list')).toBeVisible()
    await expect(page.locator('[data-task-description="Default group task"]')).not.toBeVisible()

    await createTask(page, 'Other group task')
    await expect(page.locator('[data-task-description="Other group task"]')).toBeVisible()

    await switchToGroup(page, 'Rundown')

    await expect(page.locator('[data-task-description="Default group task"]')).toBeVisible()
    await expect(page.locator('[data-task-description="Other group task"]')).not.toBeVisible()
  })

  test('switch between groups', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')

    await createGroup(page, 'Group B')

    await createTask(page, 'Task B')

    await switchToGroup(page, 'Rundown')

    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Rundown/)
    await expect(page.locator('[data-task-description="Task A"]')).toBeVisible()
    await expect(page.locator('[data-task-description="Task B"]')).not.toBeVisible()
  })

  test('task count reflects only active group', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task 1')
    await createTask(page, 'Task 2')

    await expect(page.getByText('2 tasks')).toBeVisible()

    await createGroup(page, 'Small Group')

    await createTask(page, 'Solo task')

    await expect(page.getByText('1 task')).toBeVisible()
  })
})

test.describe('persistence', () => {
  test('active group persists across restart', async () => {
    const sharedStorePath = mkdtempSync(path.join(tmpdir(), 'rundown-store-'))

    ;({ app, page } = await launchApp('idle', sharedStorePath))

    await createGroup(page, 'Persistent Group')

    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Persistent Group/)

    await createTask(page, 'Survives restart')

    await app.close()
    ;({ app, page } = await launchApp('idle', sharedStorePath))

    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Persistent Group/)
    await expect(page.locator('[data-task-description="Survives restart"]')).toBeVisible()
  })
})

test.describe('task counts in selector', () => {
  test('group selector shows task count per group', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'T1')
    await createTask(page, 'T2')

    await page.getByTestId('group-selector-trigger').click()
    const dropdown = page.getByTestId('group-selector-dropdown')

    const rundownRow = dropdown.locator('[data-testid^="group-item-"]').first()
    await expect(rundownRow).toContainText('2')
  })
})
