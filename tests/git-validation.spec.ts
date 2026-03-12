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

test('assign valid Git repo via text input', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  await createTask(page, 'Git task')
  await clickTask(page, 'Git task')

  // Click "Set directory..." to start editing
  await page.getByTestId('set-directory').click()

  // Type the path and save
  await page.getByTestId('directory-input').fill(gitDir)
  await page.getByTestId('save-directory').click()

  // Directory should be displayed, no error
  await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
  await expect(page.getByTestId('directory-error')).not.toBeVisible()
})

test('assign non-Git directory shows error', async () => {
  ;({ app, page } = await launchApp())
  const nonGitDir = mkdtempSync(path.join(tmpdir(), 'rundown-nongit-'))
  tempDirs.push(nonGitDir)

  await createTask(page, 'Non-git task')
  await clickTask(page, 'Non-git task')

  await page.getByTestId('set-directory').click()
  await page.getByTestId('directory-input').fill(nonGitDir)
  await page.getByTestId('save-directory').click()

  // Error should be shown
  await expect(page.getByTestId('directory-error')).toBeVisible()
  await expect(page.getByTestId('directory-error')).toContainText('Not a Git repository')

  // Directory should NOT be saved — input should still be visible
  await expect(page.getByTestId('directory-input')).toBeVisible()
})

test('assign non-existent path shows error', async () => {
  ;({ app, page } = await launchApp())

  await createTask(page, 'Bad path task')
  await clickTask(page, 'Bad path task')

  await page.getByTestId('set-directory').click()
  await page.getByTestId('directory-input').fill('/tmp/this-path-does-not-exist-rundown-xyz')
  await page.getByTestId('save-directory').click()

  await expect(page.getByTestId('directory-error')).toBeVisible()
  await expect(page.getByTestId('directory-error')).toContainText('Path does not exist')
})

test('sub-task inherits parent directory', async () => {
  ;({ app, page } = await launchApp())
  const gitDir = createTempGitRepo()
  tempDirs.push(gitDir)

  // Create parent task and assign directory
  await createTask(page, 'Parent task')
  await clickTask(page, 'Parent task')
  await page.getByTestId('set-directory').click()
  await page.getByTestId('directory-input').fill(gitDir)
  await page.getByTestId('save-directory').click()
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
