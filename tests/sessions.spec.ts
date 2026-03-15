import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask, markTaskDone } from './helpers/tasks'
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

test.describe('session lifecycle', () => {
  test('Start Session → terminal appears, task state = In Progress', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Session task', tempDirs)

    await startSession(page)

    await expect(page.getByTestId('no-active-session')).not.toBeVisible()

    const taskItem = page.locator('[data-task-description="Session task"]')
    await expect(taskItem).toHaveAttribute('data-task-state', 'in-progress')
  })

  test('Stop Session → terminal closes, task returns to Idle', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Stop task', tempDirs)

    await startSession(page)

    await page.getByTestId('stop-session').click()

    await expect(page.getByTestId('terminal-panel')).not.toBeVisible()
    await expect(page.getByTestId('no-active-session')).toBeVisible()

    const taskItem = page.locator('[data-task-description="Stop task"]')
    await expect(taskItem).toHaveAttribute('data-task-state', 'idle')
  })

  test('Start Session button disabled without directory', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTask(page, 'No dir task')
    await clickTask(page, 'No dir task')

    await expect(page.getByTestId('start-session')).toBeDisabled()
  })

  test('Cannot start second session on same task (button shows Stop Session)', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Single session task', tempDirs)

    await startSession(page)

    await expect(page.getByTestId('start-session')).not.toBeVisible()
    await expect(page.getByTestId('stop-session')).toBeVisible()
  })
})

test.describe('multi-task sessions', () => {
  test('Multiple sessions across tasks', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Task A', tempDirs)
    await createTaskWithDir(app, page, 'Task B', tempDirs)

    await clickTask(page, 'Task A')
    await startSession(page)

    await clickTask(page, 'Task B')
    await startSession(page)

    const taskA = page.locator('[data-task-description="Task A"]')
    const taskB = page.locator('[data-task-description="Task B"]')
    await expect(taskA).toHaveAttribute('data-task-state', 'in-progress')
    await expect(taskB).toHaveAttribute('data-task-state', 'in-progress')

    await clickTask(page, 'Task A')
    await expect(page.getByTestId('stop-session')).toBeVisible()
  })
})

test.describe('mark done with active session', () => {
  test('confirmation dialog → confirm stops session and marks done', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Done with session', tempDirs)

    await clickTask(page, 'Done with session')
    await startSession(page)

    await markTaskDone(page, 'Done with session')

    await expect(page.getByText('Stop session and mark as done?')).toBeVisible()

    await page.getByTestId('confirm-done').click()

    const taskItem = page.locator('[data-task-description="Done with session"]')
    await expect(taskItem).toHaveAttribute('data-task-state', 'done')
    await expect(page.getByTestId('terminal-panel')).not.toBeVisible()
  })

  test('confirmation dialog → cancel keeps session running', async () => {
    ;({ app, page } = await launchApp('idle'))

    await createTaskWithDir(app, page, 'Cancel done task', tempDirs)

    await clickTask(page, 'Cancel done task')
    await startSession(page)

    await markTaskDone(page, 'Cancel done task')

    await expect(page.getByText('Stop session and mark as done?')).toBeVisible()

    await page.getByTestId('cancel-done').click()

    const taskItem = page.locator('[data-task-description="Cancel done task"]')
    await expect(taskItem).toHaveAttribute('data-task-state', 'in-progress')
    await expect(page.getByTestId('terminal-panel')).toBeVisible()
  })
})
