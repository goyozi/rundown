import { z } from 'zod'
import { existsSync } from 'fs'
import { mkdir, access } from 'fs/promises'
import { resolve } from 'path'
import { homedir } from 'os'
import type { WorktreeRecord } from '../shared/types'
import { IPC } from '../shared/channels'
import { safeHandle } from './ipc-utils'
import { generateWorktreeName } from './wordlist'
import { DirPathSchema, WorktreeRecordSchema } from './validation'
import { createGit, detectDefaultBranch } from './git-utils'
import log from './logger'

function expandHome(dir: string): string {
  if (dir.startsWith('~/')) {
    return resolve(homedir(), dir.slice(2))
  }
  return resolve(dir)
}

export async function createWorktree(
  repoPath: string,
  baseDir: string,
  taskId: string
): Promise<WorktreeRecord> {
  const expandedBase = expandHome(baseDir)
  await mkdir(expandedBase, { recursive: true })

  // Normalize repoPath so comparisons on the renderer side are reliable
  // (strip trailing slashes, resolve to absolute)
  const normalizedRepo = resolve(repoPath)
  const git = createGit(normalizedRepo)
  const defaultBranch = await detectDefaultBranch(git)

  // Retry with different names on collision, fall back to UUID
  const maxAttempts = 3
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const name =
      attempt < maxAttempts
        ? generateWorktreeName(taskId)
        : `wt-${crypto.randomUUID().slice(0, 12)}`
    const worktreePath = resolve(expandedBase, name)
    const branchName = `worktree/${name}`

    try {
      await git.raw(['worktree', 'add', worktreePath, '-b', branchName, defaultBranch])
      log.info(`Worktree created: ${name} at ${worktreePath}`)
      return {
        worktreeId: crypto.randomUUID(),
        name,
        path: worktreePath,
        branchName,
        repoPath: normalizedRepo,
        createdAt: new Date().toISOString()
      }
    } catch (err) {
      if (attempt === maxAttempts) throw err
      log.warn(`Worktree name collision (attempt ${attempt + 1}/${maxAttempts}): ${name}`)
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('Failed to create worktree')
}

export async function checkWorktreeHealth(
  worktree: WorktreeRecord
): Promise<{ healthy: boolean; issues: string[] }> {
  const issues: string[] = []
  const git = createGit(worktree.repoPath)

  // 1. Directory exists?
  try {
    await access(worktree.path)
  } catch {
    issues.push('Worktree directory does not exist')
  }

  // 2. In git worktree list?
  try {
    const listOutput = await git.raw(['worktree', 'list', '--porcelain'])
    // Porcelain format uses "worktree <path>\n" lines — match exactly to avoid substring false positives
    const worktreePaths = listOutput
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length))
    if (!worktreePaths.includes(worktree.path)) {
      issues.push('Worktree not found in git worktree list')
    }
  } catch {
    issues.push('Failed to query git worktree list')
  }

  // 3. Branch ref valid?
  try {
    await git.raw(['rev-parse', '--verify', worktree.branchName])
  } catch {
    issues.push('Branch ref is invalid')
  }

  if (issues.length > 0) {
    log.warn(`Worktree health issues for ${worktree.path}: ${issues.join(', ')}`)
  }
  return { healthy: issues.length === 0, issues }
}

export async function repairWorktree(worktree: WorktreeRecord): Promise<WorktreeRecord> {
  const git = createGit(worktree.repoPath)

  // Try to clean up any stale worktree entry
  try {
    await git.raw(['worktree', 'prune'])
  } catch {
    // Ignore prune errors
  }

  // Check if branch still exists
  let branchExists = false
  try {
    await git.raw(['rev-parse', '--verify', worktree.branchName])
    branchExists = true
  } catch {
    // Branch gone
  }

  // Ensure base directory exists
  const parentDir = resolve(worktree.path, '..')
  await mkdir(parentDir, { recursive: true })

  if (branchExists && !existsSync(worktree.path)) {
    // Branch exists but directory gone — re-add worktree pointing to existing branch
    await git.raw(['worktree', 'add', worktree.path, worktree.branchName])
    log.info(`Worktree repaired (re-attached existing branch): ${worktree.path}`)
    return { ...worktree }
  } else {
    // Remove stale worktree if directory exists but git doesn't track it
    if (existsSync(worktree.path)) {
      try {
        await git.raw(['worktree', 'remove', worktree.path, '--force'])
      } catch {
        // Ignore
      }
    }

    // Delete branch if it exists
    if (branchExists) {
      try {
        await git.raw(['branch', '-D', worktree.branchName])
      } catch {
        // Ignore
      }
    }

    // Recreate fresh
    const defaultBranch = await detectDefaultBranch(git)
    await git.raw(['worktree', 'add', worktree.path, '-b', worktree.branchName, defaultBranch])
  }

  log.info(`Worktree repaired (full recreation): ${worktree.path}`)
  return {
    ...worktree,
    createdAt: new Date().toISOString()
  }
}

export async function removeWorktree(worktree: WorktreeRecord): Promise<void> {
  const git = createGit(worktree.repoPath)

  try {
    await git.raw(['worktree', 'remove', worktree.path, '--force'])
  } catch {
    // Directory may already be gone — prune stale entries
    try {
      await git.raw(['worktree', 'prune'])
    } catch {
      // Ignore
    }
  }

  try {
    await git.raw(['branch', '-D', worktree.branchName])
  } catch {
    // Branch may already be gone
  }

  log.info(`Worktree removed: ${worktree.path}`)
}

export function registerWorktreeHandlers(): void {
  safeHandle(
    IPC.WORKTREE_CREATE,
    async (
      _event,
      repoPath: unknown,
      baseDir: unknown,
      taskId: unknown
    ): Promise<WorktreeRecord> => {
      const repo = DirPathSchema.parse(repoPath)
      const base = DirPathSchema.parse(baseDir)
      const id = z.string().min(1).parse(taskId)
      return createWorktree(repo, base, id)
    }
  )

  safeHandle(
    IPC.WORKTREE_ENSURE_HEALTHY,
    async (
      _event,
      worktree: unknown
    ): Promise<{ healthy: boolean; issues: string[]; repaired?: WorktreeRecord }> => {
      const wt = WorktreeRecordSchema.parse(worktree)
      const result = await checkWorktreeHealth(wt)
      if (!result.healthy) {
        try {
          const repaired = await repairWorktree(wt)
          return { healthy: true, issues: result.issues, repaired }
        } catch {
          return result
        }
      }
      return result
    }
  )

  safeHandle(IPC.WORKTREE_CLEANUP, async (_event, worktree: unknown): Promise<void> => {
    const wt = WorktreeRecordSchema.parse(worktree)
    await removeWorktree(wt)
  })
}
