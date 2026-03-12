import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { launchApp } from './helpers/app'
import { createTask, clickTask, addSubtask } from './helpers/tasks'
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

/** Mock the native directory picker to return the given path */
async function mockOpenDirectory(app: ElectronApplication, dirPath: string): Promise<void> {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [dir] }) as ReturnType<
        typeof dialog.showOpenDialog
      >
  }, dirPath)
}

test('assign valid Git repo via file picker', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  await createTask(page, 'Git task')
  await clickTask(page, 'Git task')

  // Mock file picker to return the git directory
  await mockOpenDirectory(app, gitDir)

  // Click "Set directory..." which now opens the file picker directly
  await page.getByTestId('set-directory').click()

  // Directory should be displayed, no error
  await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
  await expect(page.getByTestId('directory-error')).not.toBeVisible()
})

test('assign non-Git directory shows error dialog', async () => {
  ;({ app, page } = await launchApp())
  const nonGitDir = mkdtempSync(path.join(tmpdir(), 'rundown-nongit-'))
  tempDirs.push(nonGitDir)

  await createTask(page, 'Non-git task')
  await clickTask(page, 'Non-git task')

  // Mock file picker to return a non-git directory
  await mockOpenDirectory(app, nonGitDir)

  await page.getByTestId('set-directory').click()

  // Error dialog should be shown
  await expect(page.getByTestId('directory-error')).toBeVisible()
  await expect(page.getByTestId('directory-error')).toContainText('Not a Git repository')
})

test('assign non-existent path shows error dialog', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Bad path task')
  await clickTask(page, 'Bad path task')

  // Mock file picker to return a non-existent path
  await mockOpenDirectory(app, '/tmp/this-path-does-not-exist-rundown-xyz')

  await page.getByTestId('set-directory').click()

  await expect(page.getByTestId('directory-error')).toBeVisible()
  await expect(page.getByTestId('directory-error')).toContainText('Path does not exist')
})

test('sub-task inherits parent directory', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  // Create parent task and assign directory via file picker
  await createTask(page, 'Parent task')
  await clickTask(page, 'Parent task')
  await mockOpenDirectory(app, gitDir)
  await page.getByTestId('set-directory').click()
  await expect(page.getByTestId('directory-display')).toHaveText(gitDir)

  // Add a sub-task
  await addSubtask(page, 'Parent task', 'Child task')

  // Click the sub-task
  await clickTask(page, 'Child task')

  // Sub-task should show inherited directory
  await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
  // Should show "inherited" label in the detail pane
  await expect(page.getByTestId('task-detail').getByText('inherited')).toBeVisible()
})
