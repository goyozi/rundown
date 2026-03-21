import { execSync } from 'child_process'
import { mkdtempSync, readdirSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { expect } from '@playwright/test'
import { Page } from 'playwright'
import type { WorktreeMode } from '../../src/shared/types'

/** Open Settings, set default worktree mode and optionally base dir, close dialog */
export async function setDefaultWorktreeMode(
  page: Page,
  mode: 'own-worktree' | 'no-worktree',
  baseDir?: string
): Promise<void> {
  await page.getByTestId('settings-button').click()
  await page.getByTestId('worktree-mode-select').click()
  const label = mode === 'own-worktree' ? 'Own worktree' : 'No worktree'
  await page.getByRole('option', { name: label }).click()
  if (baseDir) {
    const input = page.getByTestId('worktree-dir-input')
    await input.clear()
    await input.fill(baseDir)
  }
  await page.keyboard.press('Escape')
}

/** Select a worktree mode from the per-task dropdown (only works when unlocked) */
export async function selectTaskWorktreeMode(page: Page, mode: WorktreeMode): Promise<void> {
  await page.getByTestId('worktree-mode-select').click()
  // shadcn Select renders items in a popover
  const labels: Record<WorktreeMode, string> = {
    inherit: 'Inherit',
    'own-worktree': 'Own worktree',
    'no-worktree': 'No worktree'
  }
  await page.getByRole('option', { name: labels[mode] }).click()
}

/** Click the "Create" button next to the worktree mode dropdown */
export async function clickCreateWorktree(page: Page): Promise<void> {
  await page.getByTestId('create-worktree-btn').click()
}

/** Click the "Delete worktree" button and confirm the dialog */
export async function clickDeleteWorktree(page: Page): Promise<void> {
  await page.getByTestId('delete-worktree-btn').click()
  await page.getByTestId('confirm-delete-worktree').click()
}

/** Click the "×" clear-lock button and confirm the dialog */
export async function clickClearNoWorktreeLock(page: Page): Promise<void> {
  await page.getByTestId('clear-no-worktree-lock-btn').click()
  await page.getByTestId('confirm-clear-lock').click()
}

/** Click the "Lock" button for the no-worktree mode */
export async function clickLockNoWorktree(page: Page): Promise<void> {
  await page.getByTestId('lock-no-worktree-btn').click()
}

/** Check if the mode dropdown is absent (indicating locked state) */
export async function isWorktreeLocked(page: Page): Promise<boolean> {
  return !(await page
    .getByTestId('worktree-mode-select')
    .isVisible()
    .catch(() => false))
}

/** Read the muted resolved-mode text shown next to "Inherit" */
export async function getResolvedModeHint(page: Page): Promise<string | null> {
  const el = page.getByTestId('resolved-mode-hint')
  if (await el.isVisible().catch(() => false)) {
    return el.textContent()
  }
  return null
}

/** Returns text content of worktree-name element, or null if not visible */
export async function getWorktreeName(page: Page): Promise<string | null> {
  const el = page.getByTestId('worktree-name')
  if (await el.isVisible().catch(() => false)) {
    return el.textContent()
  }
  return null
}

/** Returns whether the worktree-inherited label is visible */
export async function isWorktreeInherited(page: Page): Promise<boolean> {
  return page
    .getByTestId('worktree-inherited')
    .isVisible()
    .catch(() => false)
}

/** Assert that `git worktree list` output contains a substring */
export function assertWorktreeExists(repoDir: string, nameSubstring: string): void {
  const output = execSync('git worktree list', { cwd: repoDir, encoding: 'utf-8' })
  expect(output).toContain(nameSubstring)
}

/** Assert that `git worktree list` output does NOT contain a substring */
export function assertWorktreeNotExists(repoDir: string, nameSubstring: string): void {
  const output = execSync('git worktree list', { cwd: repoDir, encoding: 'utf-8' })
  expect(output).not.toContain(nameSubstring)
}

/** Assert a branch exists in the repo */
export function assertBranchExists(repoDir: string, branchName: string): void {
  const output = execSync(`git branch --list ${branchName}`, {
    cwd: repoDir,
    encoding: 'utf-8'
  }).trim()
  expect(output).not.toBe('')
}

/** Assert a branch does NOT exist in the repo */
export function assertBranchNotExists(repoDir: string, branchName: string): void {
  const output = execSync(`git branch --list ${branchName}`, {
    cwd: repoDir,
    encoding: 'utf-8'
  }).trim()
  expect(output).toBe('')
}

/** Create a temp directory for worktrees (returns realpath to avoid macOS /var vs /private/var) */
export function createWorktreeBaseDir(): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'rundown-wt-')))
}

/** List subdirectories in the worktree base dir */
export function getWorktreeDirs(baseDir: string): string[] {
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

/** Read terminal output and extract the cwd: line */
export async function getTerminalCwd(page: Page): Promise<string> {
  const terminal = page.getByTestId('terminal-panel')
  await expect(terminal).toBeVisible({ timeout: 10000 })
  // Wait a moment for the cwd output to render
  await page.waitForTimeout(500)
  const text = await terminal.textContent()
  // Match cwd: followed by an absolute path, terminated by :endcwd delimiter
  const match = text?.match(/cwd:(\/[^:]+):endcwd/)
  if (!match) throw new Error(`Could not find cwd: in terminal output: ${text?.slice(0, 200)}`)
  return match[1]
}

/**
 * Normalize a macOS path so /var/... and /private/var/... compare equal.
 * We canonicalize to /private/var/... since that's what process.cwd() returns.
 */
export function normalizePath(p: string): string {
  if (p.startsWith('/var/')) return '/private' + p
  return p
}

/** Poll until worktree dir count matches expected, with timeout */
export async function waitForWorktreeCleanup(
  baseDir: string,
  expectedCount: number,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (getWorktreeDirs(baseDir).length === expectedCount) return
    await new Promise((r) => setTimeout(r, 200))
  }
  const actual = getWorktreeDirs(baseDir).length
  expect(actual).toBe(expectedCount)
}

/** Poll until a branch no longer exists in the repo, with timeout.
 *  Worktree cleanup is fire-and-forget: the directory disappears before
 *  `git branch -D` finishes, so callers need to poll for the branch too. */
export async function waitForBranchCleanup(
  repoDir: string,
  branchName: string,
  timeoutMs = 5000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const output = execSync(`git branch --list ${branchName}`, {
      cwd: repoDir,
      encoding: 'utf-8'
    }).trim()
    if (output === '') return
    await new Promise((r) => setTimeout(r, 200))
  }
  // Final assertion to produce a clear error message
  assertBranchNotExists(repoDir, branchName)
}
