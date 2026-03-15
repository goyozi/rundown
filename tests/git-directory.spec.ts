import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { launchApp } from './helpers/app'
import { createTask, clickTask, addSubtask } from './helpers/tasks'
import { mockOpenDirectory } from './helpers/electron'
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

test.describe('assignment validation', () => {
  test('assign valid Git repo via file picker', async () => {
    ;({ app, page } = await launchApp())
    const gitDir = createTempGitRepo()
    tempDirs.push(gitDir)

    await createTask(page, 'Git task')
    await clickTask(page, 'Git task')

    await mockOpenDirectory(app, gitDir)
    await page.getByTestId('set-directory').click()

    await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
    await expect(page.getByTestId('directory-error')).not.toBeVisible()
  })

  test('assign non-Git directory shows error dialog', async () => {
    ;({ app, page } = await launchApp())
    const nonGitDir = mkdtempSync(path.join(tmpdir(), 'rundown-nongit-'))
    tempDirs.push(nonGitDir)

    await createTask(page, 'Non-git task')
    await clickTask(page, 'Non-git task')

    await mockOpenDirectory(app, nonGitDir)
    await page.getByTestId('set-directory').click()

    await expect(page.getByTestId('directory-error')).toBeVisible()
    await expect(page.getByTestId('directory-error')).toContainText('Not a Git repository')
  })

  test('assign non-existent path shows error dialog', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Bad path task')
    await clickTask(page, 'Bad path task')

    await mockOpenDirectory(app, '/tmp/this-path-does-not-exist-rundown-xyz')
    await page.getByTestId('set-directory').click()

    await expect(page.getByTestId('directory-error')).toBeVisible()
    await expect(page.getByTestId('directory-error')).toContainText('Path does not exist')
  })
})

test.describe('group directory', () => {
  test('set group directory via file picker', async () => {
    ;({ app, page } = await launchApp())
    const gitDir = createTempGitRepo()
    tempDirs.push(gitDir)

    await mockOpenDirectory(app, gitDir)
    await page.getByTestId('group-directory-picker').click()

    await expect(page.getByTestId('group-directory-picker')).toContainText(gitDir)
  })
})

test.describe('directory inheritance', () => {
  test('task inherits group directory', async () => {
    ;({ app, page } = await launchApp())
    const gitDir = createTempGitRepo()
    tempDirs.push(gitDir)

    await mockOpenDirectory(app, gitDir)
    await page.getByTestId('group-directory-picker').click()
    await expect(page.getByTestId('group-directory-picker')).toContainText(gitDir)

    await createTask(page, 'Group dir task')
    await clickTask(page, 'Group dir task')

    await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
    await expect(page.getByTestId('task-detail').getByText('inherited')).toBeVisible()
  })

  test('task own directory overrides group directory', async () => {
    ;({ app, page } = await launchApp())
    const groupDir = createTempGitRepo()
    const taskDir = createTempGitRepo()
    tempDirs.push(groupDir, taskDir)

    await mockOpenDirectory(app, groupDir)
    await page.getByTestId('group-directory-picker').click()
    await expect(page.getByTestId('group-directory-picker')).toContainText(groupDir)

    await createTask(page, 'Own dir task')
    await clickTask(page, 'Own dir task')
    await mockOpenDirectory(app, taskDir)
    await page.getByTestId('directory-display').click()

    await expect(page.getByTestId('directory-display')).toHaveText(taskDir)
    await expect(page.getByTestId('task-detail').getByText('inherited')).not.toBeVisible()
  })

  test('sub-task inherits parent directory', async () => {
    ;({ app, page } = await launchApp())
    const gitDir = createTempGitRepo()
    tempDirs.push(gitDir)

    await createTask(page, 'Parent task')
    await clickTask(page, 'Parent task')
    await mockOpenDirectory(app, gitDir)
    await page.getByTestId('set-directory').click()
    await expect(page.getByTestId('directory-display')).toHaveText(gitDir)

    await addSubtask(page, 'Parent task', 'Child task')

    await clickTask(page, 'Child task')

    await expect(page.getByTestId('directory-display')).toHaveText(gitDir)
    await expect(page.getByTestId('task-detail').getByText('inherited')).toBeVisible()
  })
})
