import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask, markTaskDone } from './helpers/tasks'
import { createTempGitRepo } from './fixtures/git-repo'

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

async function mockOpenDirectory(app: ElectronApplication, dirPath: string): Promise<void> {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [dir] }) as ReturnType<
        typeof dialog.showOpenDialog
      >
  }, dirPath)
}

async function createTaskWithDir(page: Page, name: string): Promise<string> {
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  await createTask(page, name)
  await clickTask(page, name)
  await mockOpenDirectory(app, gitDir)
  await page.getByTestId('set-directory').click()
  await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
  return gitDir
}

test('Start Session → terminal appears, task state = In Progress', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTaskWithDir(page, 'Session task')

  // Start session
  await page.getByTestId('start-session').click()

  // Terminal panel should appear
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // "No active session" placeholder should be gone
  await expect(page.getByTestId('no-active-session')).not.toBeVisible()

  // Task state in sidebar should be in-progress
  const taskItem = page.locator('[data-task-description="Session task"]')
  await expect(taskItem).toHaveAttribute('data-task-state', 'in-progress')
})

test('Stop Session → terminal closes, task returns to Idle', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTaskWithDir(page, 'Stop task')

  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Stop session
  await page.getByTestId('stop-session').click()

  // Terminal should be gone, placeholder back
  await expect(page.getByTestId('terminal-panel')).not.toBeVisible()
  await expect(page.getByTestId('no-active-session')).toBeVisible()

  // Task state should be idle again
  const taskItem = page.locator('[data-task-description="Stop task"]')
  await expect(taskItem).toHaveAttribute('data-task-state', 'idle')
})

test('Start Session button disabled without directory', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTask(page, 'No dir task')
  await clickTask(page, 'No dir task')

  // Start session button should be disabled
  await expect(page.getByTestId('start-session')).toBeDisabled()
})

test('Cannot start second session on same task (button shows Stop Session)', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTaskWithDir(page, 'Single session task')

  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Start Session button should be gone, replaced by Stop Session
  await expect(page.getByTestId('start-session')).not.toBeVisible()
  await expect(page.getByTestId('stop-session')).toBeVisible()
})

test('Multiple sessions across tasks', async () => {
  ;({ app, page } = await launchApp('idle'))

  // Create two tasks with directories
  await createTaskWithDir(page, 'Task A')
  await createTaskWithDir(page, 'Task B')

  // Start session on Task A
  await clickTask(page, 'Task A')
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Start session on Task B
  await clickTask(page, 'Task B')
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Both tasks should show in-progress
  const taskA = page.locator('[data-task-description="Task A"]')
  const taskB = page.locator('[data-task-description="Task B"]')
  await expect(taskA).toHaveAttribute('data-task-state', 'in-progress')
  await expect(taskB).toHaveAttribute('data-task-state', 'in-progress')

  // Switch back to Task A - should still show terminal
  await clickTask(page, 'Task A')
  await expect(page.getByTestId('stop-session')).toBeVisible()
})

test('Mark as Done with active session → confirmation dialog → confirm', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTaskWithDir(page, 'Done with session')

  // Start session
  await clickTask(page, 'Done with session')
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Try to mark as done via sidebar toggle
  await markTaskDone(page, 'Done with session')

  // Confirmation dialog should appear
  await expect(page.getByText('Stop session and mark as done?')).toBeVisible()

  // Confirm
  await page.getByTestId('confirm-done').click()

  // Task should be done, terminal gone
  const taskItem = page.locator('[data-task-description="Done with session"]')
  await expect(taskItem).toHaveAttribute('data-task-state', 'done')
  await expect(page.getByTestId('terminal-panel')).not.toBeVisible()
})

test('Mark as Done with active session → confirmation dialog → cancel', async () => {
  ;({ app, page } = await launchApp('idle'))

  await createTaskWithDir(page, 'Cancel done task')

  // Start session
  await clickTask(page, 'Cancel done task')
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible()

  // Try to mark as done
  await markTaskDone(page, 'Cancel done task')

  // Confirmation dialog should appear
  await expect(page.getByText('Stop session and mark as done?')).toBeVisible()

  // Cancel
  await page.getByTestId('cancel-done').click()

  // Task should still be in-progress with terminal visible
  const taskItem = page.locator('[data-task-description="Cancel done task"]')
  await expect(taskItem).toHaveAttribute('data-task-state', 'in-progress')
  await expect(page.getByTestId('terminal-panel')).toBeVisible()
})
