import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'
import { mockOpenDirectory } from './helpers/electron'
import { assignDirectory } from './helpers/sessions'
import { goToReview, switchToBranchMode } from './helpers/review'
import {
  createTempGitRepo,
  dirtyRepo,
  ensureMainBranch,
  createFeatureBranch
} from './fixtures/git-repo'

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

async function setupTaskWithRepo(
  taskName: string,
  prepareRepo?: (dir: string) => void
): Promise<string> {
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  if (prepareRepo) prepareRepo(gitDir)

  await createTask(page, taskName)
  await clickTask(page, taskName)
  await mockOpenDirectory(app, gitDir)
  await assignDirectory(page, gitDir)
  return gitDir
}

test.describe('uncommitted changes mode', () => {
  test('shows modified file', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Diff task', dirtyRepo)

    await goToReview(page)

    await expect(page.getByTestId('diff-files')).toBeVisible()
    await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
    await expect(page.locator('.diff-code-insert')).toBeVisible()
    await expect(page.locator('.diff-code-delete')).toBeVisible()
  })

  test('clean repo shows no changes', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Clean task')

    await goToReview(page)
    await expect(page.getByTestId('no-changes')).toBeVisible()
  })
})

test.describe('branch vs main mode', () => {
  test('shows committed diff', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Branch task', createFeatureBranch)

    await goToReview(page)
    await switchToBranchMode(page)

    await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
    await expect(page.locator('.diff-code-insert')).toBeVisible()
  })

  test('auto-detects main vs master', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Main detect task', ensureMainBranch)

    await goToReview(page)
    await expect(page.getByTestId('branch-info')).toContainText('main')
  })
})

test.describe('UI controls', () => {
  test('collapse/expand file in diff', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Collapse task', dirtyRepo)

    await goToReview(page)
    await expect(page.getByTestId('diff-files')).toBeVisible()

    await expect(page.locator('.diff-code-insert')).toBeVisible()

    await page.locator('[data-testid^="file-header-"]').first().click()
    await expect(page.locator('.diff-code-insert')).not.toBeVisible()

    await page.locator('[data-testid^="file-header-"]').first().click()
    await expect(page.locator('.diff-code-insert')).toBeVisible()
  })

  test('summary bar shows correct counts', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Summary task', dirtyRepo)

    await goToReview(page)
    await expect(page.getByTestId('diff-summary')).toBeVisible()
    await expect(page.getByTestId('diff-summary')).toContainText('1')
    await expect(page.getByTestId('diff-summary')).toContainText('file')
  })

  test('refresh button reloads diff', async () => {
    ;({ app, page } = await launchApp())
    const gitDir = await setupTaskWithRepo('Refresh task')

    await goToReview(page)
    await expect(page.getByTestId('no-changes')).toBeVisible()

    dirtyRepo(gitDir)

    await page.getByTestId('refresh-diff').click()

    await expect(page.getByTestId('diff-files')).toBeVisible()
    await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
  })
})

test.describe('mode switching', () => {
  test('toggle between modes shows correct diff for each', async () => {
    ;({ app, page } = await launchApp())
    await setupTaskWithRepo('Toggle task', (dir) => {
      createFeatureBranch(dir)
      dirtyRepo(dir)
    })

    await goToReview(page)

    await expect(page.getByTestId('mode-uncommitted')).toBeVisible()
    await expect(page.getByTestId('diff-files')).toBeVisible()
    const uncommittedFiles = await page.locator('[data-testid^="diff-file-"]').count()
    expect(uncommittedFiles).toBe(1)

    await switchToBranchMode(page)
    const branchFiles = await page.locator('[data-testid^="diff-file-"]').count()
    expect(branchFiles).toBeGreaterThanOrEqual(1)

    await page.getByTestId('mode-uncommitted').click()
    await expect(page.locator('[data-testid^="diff-file-"]')).toHaveCount(1)
  })

  test('diff mode is remembered per task when switching between tasks', async () => {
    ;({ app, page } = await launchApp())

    const dirA = createTempGitRepo()
    tempDirs.push(dirA)
    createFeatureBranch(dirA)

    const dirB = createTempGitRepo()
    tempDirs.push(dirB)
    ensureMainBranch(dirB)
    dirtyRepo(dirB)

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')

    await clickTask(page, 'Task A')
    await mockOpenDirectory(app, dirA)
    await assignDirectory(page, dirA)
    await goToReview(page)

    await switchToBranchMode(page)

    await clickTask(page, 'Task B')
    await mockOpenDirectory(app, dirB)
    await assignDirectory(page, dirB)
    await goToReview(page)
    await expect(page.getByTestId('mode-uncommitted')).toHaveClass(/bg-primary/)
    await expect(page.getByTestId('diff-files')).toBeVisible()

    await clickTask(page, 'Task A')
    await expect(page.getByTestId('mode-branch')).toHaveClass(/bg-primary/, { timeout: 5000 })
    await expect(page.getByTestId('diff-files')).toBeVisible()

    await clickTask(page, 'Task B')
    await expect(page.getByTestId('mode-uncommitted')).toHaveClass(/bg-primary/, {
      timeout: 5000
    })
  })
})
