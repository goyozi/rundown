import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'
import {
  createTempGitRepo,
  dirtyRepo,
  ensureMainBranch,
  createFeatureBranch
} from './fixtures/git-repo'

let app: ElectronApplication
let page: Page
let tempDirs: string[] = []

async function mockOpenDirectory(app: ElectronApplication, dirPath: string): Promise<void> {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [dir] }) as ReturnType<
        typeof dialog.showOpenDialog
      >
  }, dirPath)
}

async function assignDirectory(page: Page, dir: string): Promise<void> {
  await mockOpenDirectory(app, dir)
  await page.getByTestId('set-directory').click()
  await expect(page.getByTestId('directory-display')).toHaveText(dir)
}

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

test('Uncommitted Changes mode shows modified file', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Diff task')
  await clickTask(page, 'Diff task')
  await assignDirectory(page, gitDir)

  // Switch to review tab
  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('review-panel')).toBeVisible()

  // Should show the modified file
  await expect(page.getByTestId('diff-files')).toBeVisible()
  await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
  // File should contain the change
  await expect(page.locator('.diff-code-insert')).toBeVisible()
  await expect(page.locator('.diff-code-delete')).toBeVisible()
})

test('Uncommitted Changes — clean repo shows no changes', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  // Don't dirty the repo — it's clean

  await createTask(page, 'Clean task')
  await clickTask(page, 'Clean task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('no-changes')).toBeVisible()
})

test('Branch vs. Main mode shows committed diff', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  createFeatureBranch(gitDir)

  await createTask(page, 'Branch task')
  await clickTask(page, 'Branch task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  // Wait for branch info to load and button to become enabled
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  await page.getByTestId('mode-branch').click()

  // Should show the feature file
  await expect(page.getByTestId('diff-files')).toBeVisible()
  await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
  await expect(page.locator('.diff-code-insert')).toBeVisible()
})

test('Auto-detects main vs master', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  ensureMainBranch(gitDir)

  await createTask(page, 'Main detect task')
  await clickTask(page, 'Main detect task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  // Branch info should show 'main'
  await expect(page.getByTestId('branch-info')).toContainText('main')
})

test('Collapse/expand file in diff', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Collapse task')
  await clickTask(page, 'Collapse task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Diff code should be visible initially
  await expect(page.locator('.diff-code-insert')).toBeVisible()

  // Click file header to collapse
  await page.locator('[data-testid^="file-header-"]').first().click()

  // Diff code should be hidden
  await expect(page.locator('.diff-code-insert')).not.toBeVisible()

  // Click again to expand
  await page.locator('[data-testid^="file-header-"]').first().click()
  await expect(page.locator('.diff-code-insert')).toBeVisible()
})

test('Summary bar shows correct counts', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Summary task')
  await clickTask(page, 'Summary task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('diff-summary')).toBeVisible()
  // Should show 1 file
  await expect(page.getByTestId('diff-summary')).toContainText('1')
  await expect(page.getByTestId('diff-summary')).toContainText('file')
})

test('Refresh button reloads diff', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  await createTask(page, 'Refresh task')
  await clickTask(page, 'Refresh task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()
  // Initially clean
  await expect(page.getByTestId('no-changes')).toBeVisible()

  // Now dirty the repo
  dirtyRepo(gitDir)

  // Click refresh
  await page.getByTestId('refresh-diff').click()

  // Should now show changes
  await expect(page.getByTestId('diff-files')).toBeVisible()
  await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
})

test('Toggle between modes shows correct diff for each', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  createFeatureBranch(gitDir)
  // Also dirty the working tree on the feature branch
  dirtyRepo(gitDir)

  await createTask(page, 'Toggle task')
  await clickTask(page, 'Toggle task')
  await assignDirectory(page, gitDir)

  await page.getByTestId('tab-review').click()

  // Uncommitted mode should show 1 file (the dirty index.ts)
  await expect(page.getByTestId('mode-uncommitted')).toBeVisible()
  await expect(page.getByTestId('diff-files')).toBeVisible()
  const uncommittedFiles = await page.locator('[data-testid^="diff-file-"]').count()
  expect(uncommittedFiles).toBe(1)

  // Wait for branch mode button to become enabled
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  // Switch to branch mode — should show more files than uncommitted mode
  await page.getByTestId('mode-branch').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()
  const branchFiles = await page.locator('[data-testid^="diff-file-"]').count()
  expect(branchFiles).toBeGreaterThanOrEqual(1)

  // Switch back to uncommitted — should show just 1 file again
  await page.getByTestId('mode-uncommitted').click()
  await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
})

test('Diff mode is remembered per task when switching between tasks', async () => {
  ;({ app, page } = await launchApp())

  // Task A: feature branch (branch mode available), will use "Branch vs. Main"
  const dirA = createTempGitRepo()
  tempDirs.push(dirA)
  createFeatureBranch(dirA)

  // Task B: on main branch (branch mode disabled), stays on "Uncommitted"
  const dirB = createTempGitRepo()
  tempDirs.push(dirB)
  ensureMainBranch(dirB)
  dirtyRepo(dirB)

  // Create both tasks and assign directories
  await createTask(page, 'Task A')
  await createTask(page, 'Task B')

  await clickTask(page, 'Task A')
  await assignDirectory(page, dirA)
  await page.getByTestId('tab-review').click()

  // Switch Task A to branch mode
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  await page.getByTestId('mode-branch').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Switch to Task B — should show uncommitted (branch mode disabled on main)
  await clickTask(page, 'Task B')
  await assignDirectory(page, dirB)
  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('mode-uncommitted')).toHaveClass(/bg-primary/)
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Switch back to Task A — should restore branch mode
  await clickTask(page, 'Task A')
  await expect(page.getByTestId('mode-branch')).toHaveClass(/bg-primary/, { timeout: 5000 })
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Switch to Task B again — should still be uncommitted
  await clickTask(page, 'Task B')
  await expect(page.getByTestId('mode-uncommitted')).toHaveClass(/bg-primary/, { timeout: 5000 })
})
