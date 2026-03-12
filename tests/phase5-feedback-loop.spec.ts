import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'
import { createTempGitRepo, dirtyRepo, createFeatureBranch } from './fixtures/git-repo'

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

async function startSession(page: Page): Promise<void> {
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 10000 })
}

async function goToReview(page: Page): Promise<void> {
  await expect(page.getByTestId('tab-review')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('review-panel')).toBeVisible({ timeout: 5000 })
}

async function addCommentOnFirstGutter(page: Page): Promise<void> {
  // Click the first gutter cell in the diff to add a comment
  const gutter = page.locator('.diff-gutter').first()
  await gutter.click()
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

test('Add inline comment on a line', async () => {
  ;({ app, page } = await launchApp('idle'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Comment task')
  await clickTask(page, 'Comment task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  // Wait for diff to load
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Click gutter to add comment
  await addCommentOnFirstGutter(page)

  // Comment widget should appear
  await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(1)

  // Comment count badge should show 1
  await expect(page.getByTestId('comment-count-badge')).toContainText('1')
})

test('Comments persist on diff mode switch', async () => {
  ;({ app, page } = await launchApp('idle'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  createFeatureBranch(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Mode switch task')
  await clickTask(page, 'Mode switch task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  // Add comment in uncommitted mode
  await expect(page.getByTestId('diff-files')).toBeVisible()
  await addCommentOnFirstGutter(page)

  // Type in the comment
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Fix this line')

  // Switch to branch mode
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  await page.getByTestId('mode-branch').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Switch back to uncommitted
  await page.getByTestId('mode-uncommitted').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Comment should still be there
  await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(1)
  await expect(page.locator('[data-testid^="comment-textarea-"]').first()).toHaveValue(
    'Fix this line'
  )
})

test('Comment on file only in one mode is hidden in other', async () => {
  ;({ app, page } = await launchApp('idle'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  createFeatureBranch(gitDir)
  // Don't dirty the repo — so uncommitted mode has no changes
  // but branch mode has the feature file

  await createTask(page, 'Hidden comment task')
  await clickTask(page, 'Hidden comment task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  // Switch to branch mode (which has the feature file)
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  await page.getByTestId('mode-branch').click()
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Add a comment
  await addCommentOnFirstGutter(page)
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Branch comment')

  // Switch to uncommitted mode — no files, so comment should be hidden
  await page.getByTestId('mode-uncommitted').click()

  // Submit footer should show hidden count
  await expect(page.getByTestId('hidden-comment-info')).toBeVisible()
  await expect(page.getByTestId('hidden-comment-info')).toContainText('1 hidden')
})

test('Submit to Claude sends all comments', async () => {
  ;({ app, page } = await launchApp('apply-feedback'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Submit task')
  await clickTask(page, 'Submit task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  // Wait for diff
  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Add a comment
  await addCommentOnFirstGutter(page)
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Please fix this')

  // Submit
  await page.getByTestId('submit-to-claude').click()

  // Should switch to terminal tab
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })

  // Terminal should show the stub response (apply-feedback preset)
  // The stub writes "Got your feedback. Applying changes..." on first stdin
  await expect(page.locator('.xterm-rows')).toContainText('Got your feedback', { timeout: 5000 })
})

test('Feedback format matches spec', async () => {
  ;({ app, page } = await launchApp('echo'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Format task')
  await clickTask(page, 'Format task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Add a comment
  await addCommentOnFirstGutter(page)
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Rename this variable')

  // Submit
  await page.getByTestId('submit-to-claude').click()

  // With echo stub, the terminal should show the sent text echoed back
  // Check for the header format: ## filepath (line N)
  await expect(page.locator('.xterm-rows')).toContainText('review feedback', { timeout: 5000 })
  await expect(page.locator('.xterm-rows')).toContainText('index.ts', { timeout: 5000 })
  await expect(page.locator('.xterm-rows')).toContainText('Rename this variable', { timeout: 5000 })
})

test('Comments cleared after submission', async () => {
  ;({ app, page } = await launchApp('apply-feedback'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Clear task')
  await clickTask(page, 'Clear task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Add a comment
  await addCommentOnFirstGutter(page)
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Fix this')

  // Submit
  await page.getByTestId('submit-to-claude').click()

  // After submission, switch back to review
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('tab-review').click()

  // Comments should be gone
  await expect(page.locator('[data-testid^="comment-widget-"]')).toHaveCount(0)
  // Submit footer should be gone
  await expect(page.getByTestId('submit-footer')).not.toBeVisible()
})

test('Terminal focused after submission', async () => {
  ;({ app, page } = await launchApp('apply-feedback'))
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)
  dirtyRepo(gitDir)

  await createTask(page, 'Focus task')
  await clickTask(page, 'Focus task')
  await assignDirectory(page, gitDir)
  await startSession(page)
  await goToReview(page)

  await expect(page.getByTestId('diff-files')).toBeVisible()

  // Add a comment and submit
  await addCommentOnFirstGutter(page)
  const textarea = page.locator('[data-testid^="comment-textarea-"]').first()
  await textarea.fill('Check this')
  await page.getByTestId('submit-to-claude').click()

  // Terminal panel should be active (tab switched)
  await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 5000 })
  // The terminal tab should be the active one
  const terminalTab = page.getByTestId('tab-terminal')
  await expect(terminalTab).toHaveClass(/border-primary/)
})
