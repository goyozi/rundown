import { expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { createTask, clickTask } from './tasks'
import { mockOpenDirectory } from './electron'
import { createTempGitRepo } from '../fixtures/git-repo'

export async function startSession(page: Page): Promise<void> {
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 10000 })
}

export async function stopSession(page: Page): Promise<void> {
  await page.getByTestId('stop-session').click()
  await expect(page.getByTestId('terminal-panel')).not.toBeVisible()
}

export async function assignDirectory(page: Page, dir: string): Promise<void> {
  await page.getByTestId('set-directory').click()
  await expect(page.getByTestId('directory-display')).toHaveText(dir)
}

/**
 * Create a task, select it, assign a temp git repo, and return the repo path.
 * Pushes the dir to `tempDirs` for cleanup.
 */
export async function createTaskWithDir(
  app: ElectronApplication,
  page: Page,
  name: string,
  tempDirs: string[]
): Promise<string> {
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  await createTask(page, name)
  await clickTask(page, name)
  await mockOpenDirectory(app, gitDir)
  await assignDirectory(page, gitDir)
  return gitDir
}
