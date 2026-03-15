import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'
import { mockOpenDirectory } from './helpers/electron'
import { assignDirectory, startSession } from './helpers/sessions'
import { goToReview, addCommentOnFirstGutter, switchToBranchMode } from './helpers/review'
import { createTempGitRepo, dirtyRepo, createFeatureBranch } from './fixtures/git-repo'

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

async function setupTaskWithSessionAndReview(
  taskName: string,
  stubPreset: string,
  prepareRepo?: (dir: string) => void
): Promise<string> {
  ;({ app, page } = await launchApp(stubPreset))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  if (prepareRepo) prepareRepo(gitDir)

  await createTask(page, taskName)
  await clickTask(page, taskName)
  await mockOpenDirectory(app, gitDir)
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)
  await expect(page.getByTestId('diff-files')).toBeVisible()
  return gitDir
}

test.describe('adding comments', () => {
  test('add inline comment on a line', async () => {
    await setupTaskWithSessionAndReview('Comment task', 'idle', dirtyRepo)

    await addCommentOnFirstGutter(page)

    await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(1)
    await expect(page.getByTestId('comment-count-badge')).toContainText('1')
  })
})

test.describe('comment persistence', () => {
  test('comments persist on diff mode switch', async () => {
    await setupTaskWithSessionAndReview('Mode switch task', 'idle', (dir) => {
      createFeatureBranch(dir)
      dirtyRepo(dir)
    })

    await addCommentOnFirstGutter(page)

    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Fix this line')

    await switchToBranchMode(page)

    await page.getByTestId('mode-uncommitted').click()
    await expect(page.getByTestId('diff-files')).toBeVisible()

    await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(1)
    await expect(page.locator('[data-testid^="comment-textarea-"]').first()).toHaveValue(
      'Fix this line'
    )
  })

  test('comment on file only in one mode is hidden in other', async () => {
    // Don't use setupTaskWithSessionAndReview — this test intentionally has no
    // uncommitted changes, so diff-files won't be visible in default mode.
    ;({ app, page } = await launchApp('idle'))
    const gitDir = createTempGitRepo()
    tempDirs.push(gitDir)
    createFeatureBranch(gitDir)

    await createTask(page, 'Hidden comment task')
    await clickTask(page, 'Hidden comment task')
    await mockOpenDirectory(app, gitDir)
    await assignDirectory(page, gitDir)
    await startSession(page)
    await goToReview(page)

    await switchToBranchMode(page)

    await addCommentOnFirstGutter(page)
    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Branch comment')

    await page.getByTestId('mode-uncommitted').click()

    await expect(page.getByTestId('hidden-comment-info')).toBeVisible()
    await expect(page.getByTestId('hidden-comment-info')).toContainText('1 hidden')
  })
})

test.describe('submission', () => {
  test('submit to Claude sends all comments', async () => {
    await setupTaskWithSessionAndReview('Submit task', 'apply-feedback', dirtyRepo)

    await addCommentOnFirstGutter(page)
    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Please fix this')

    await page.getByTestId('submit-to-claude').click()

    await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.xterm-rows')).toContainText('Got your feedback', {
      timeout: 5000
    })
  })

  test('feedback format matches spec', async () => {
    await setupTaskWithSessionAndReview('Format task', 'echo', dirtyRepo)

    await addCommentOnFirstGutter(page)
    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Rename this variable')

    await page.getByTestId('submit-to-claude').click()

    await expect(page.locator('.xterm-rows')).toContainText('review feedback', { timeout: 5000 })
    await expect(page.locator('.xterm-rows')).toContainText('index.ts', { timeout: 5000 })
    await expect(page.locator('.xterm-rows')).toContainText('Rename this variable', {
      timeout: 5000
    })
  })

  test('comments cleared after submission', async () => {
    await setupTaskWithSessionAndReview('Clear task', 'apply-feedback', dirtyRepo)

    await addCommentOnFirstGutter(page)
    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Fix this')

    await page.getByTestId('submit-to-claude').click()

    await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('tab-review').click()

    await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(0)
    await expect(page.getByTestId('submit-footer')).not.toBeVisible()
  })

  test('terminal focused after submission', async () => {
    await setupTaskWithSessionAndReview('Focus task', 'apply-feedback', dirtyRepo)

    await addCommentOnFirstGutter(page)
    const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
    await textarea.fill('Check this')
    await page.getByTestId('submit-to-claude').click()

    await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })
    const terminalTab = page.getByTestId('tab-terminal')
    await expect(terminalTab).toHaveClass(/border-primary/)
  })
})
