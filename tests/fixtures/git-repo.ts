import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

export function createTempGitRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rundown-test-'))
  execSync('git init && git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' })
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 1;\n')
  execSync('git add . && git commit -m "initial file"', { cwd: dir, stdio: 'ignore' })
  return dir
}

export function dirtyRepo(dir: string): void {
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 2; // changed\n')
}

/** Rename the default branch to 'main' (some git versions default to 'master') */
export function ensureMainBranch(dir: string): void {
  execSync('git branch -M main', { cwd: dir, stdio: 'ignore' })
}

/** Create a feature branch with a committed change, leaving working tree on the feature branch */
export function createFeatureBranch(dir: string, branchName = 'feature'): void {
  ensureMainBranch(dir)
  execSync(`git checkout -b ${branchName}`, { cwd: dir, stdio: 'ignore' })
  writeFileSync(path.join(dir, 'feature.ts'), 'export const feature = true;\n')
  execSync('git add . && git commit -m "add feature"', { cwd: dir, stdio: 'ignore' })
}

/** Delete a tracked file (without staging the deletion) */
export function deleteTrackedFile(dir: string): void {
  unlinkSync(path.join(dir, 'index.ts'))
}

/** Add an untracked file (not staged, not committed) */
export function addUntrackedFile(dir: string, name = 'untracked.ts'): void {
  writeFileSync(path.join(dir, name), 'export const untracked = true;\n')
}

/** Add a commit on main after the feature branch was created */
export function advanceMainBranch(dir: string): void {
  execSync('git checkout main', { cwd: dir, stdio: 'ignore' })
  writeFileSync(path.join(dir, 'main-only.ts'), 'export const mainOnly = true;\n')
  execSync('git add . && git commit -m "advance main"', { cwd: dir, stdio: 'ignore' })
  execSync('git checkout -', { cwd: dir, stdio: 'ignore' })
}
