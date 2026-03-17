import { execSync } from 'child_process'
import { mkdtempSync, readdirSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { expect } from '@playwright/test'
import { Page } from 'playwright'

/** Open Settings, toggle worktrees ON, set base dir, close dialog */
export async function enableWorktrees(page: Page, baseDir: string): Promise<void> {
  await page.getByTestId('settings-button').click()
  const toggle = page.getByTestId('worktrees-toggle')
  // Only click if not already checked
  if (!(await toggle.isChecked())) {
    await toggle.click()
  }
  const input = page.getByTestId('worktree-dir-input')
  await input.clear()
  await input.fill(baseDir)
  // Close dialog by pressing Escape
  await page.keyboard.press('Escape')
}

/** Open Settings, toggle worktrees OFF, close dialog */
export async function disableWorktrees(page: Page): Promise<void> {
  await page.getByTestId('settings-button').click()
  const toggle = page.getByTestId('worktrees-toggle')
  if (await toggle.isChecked()) {
    await toggle.click()
  }
  await page.keyboard.press('Escape')
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
