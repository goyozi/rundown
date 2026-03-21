import { useCallback, useRef, useState } from 'react'
import { useTaskStore } from '@/store/task-store'
import type { WorktreeRecord } from '../../../shared/types'

/**
 * Encapsulates worktree lifecycle orchestration: resolving the session CWD
 * (with health-check, repair, and lazy creation), creating worktrees on demand,
 * and a mutex that prevents concurrent worktree creation races.
 */
export function useWorktreeSession(): {
  resolveSessionCwd: (taskId: string) => Promise<string | undefined>
  createWorktreeNow: (taskId: string) => Promise<void>
  worktreeWarning: string | null
  clearWorktreeWarning: () => void
} {
  const [worktreeWarning, setWorktreeWarning] = useState<string | null>(null)
  // Mutex: keyed by task ID to prevent concurrent creation for the same worktree
  const creatingRef = useRef<Set<string>>(new Set())

  const ensureHealthy = async (worktree: WorktreeRecord, repoDir: string): Promise<string> => {
    const store = useTaskStore.getState()
    const health = await window.api.worktreeEnsureHealthy(worktree)
    if (health.healthy) {
      if (health.repaired) {
        // Find the actual owner task and update its worktree record
        const tasks = store.tasks
        const owner = tasks.find((t) => t.worktree?.worktreeId === worktree.worktreeId)
        if (owner) store.setWorktreeOnTask(owner.id, health.repaired)
        setWorktreeWarning(
          `Worktree "${worktree.name}" was repaired: ${health.issues.join(', ')}. Uncommitted work may have been lost.`
        )
      }
      return health.repaired?.path ?? worktree.path
    }
    // Repair failed — notify user and fall back to repo dir
    setWorktreeWarning(
      `Worktree "${worktree.name}" is broken and could not be repaired: ${health.issues.join(', ')}. Using repo directory instead.`
    )
    return repoDir
  }

  const resolveSessionCwd = useCallback(async (taskId: string): Promise<string | undefined> => {
    const store = useTaskStore.getState()
    const repoDir = store.getEffectiveDirectory(taskId)
    if (!repoDir) return undefined

    const resolvedMode = store.resolveEffectiveMode(taskId)

    if (resolvedMode === 'no-worktree') {
      store.lockTask(taskId)
      return repoDir
    }

    // resolvedMode === 'own-worktree'
    // Check for an existing worktree (own or inherited via getEffectiveWorktree)
    const effectiveWorktree = store.getEffectiveWorktree(taskId)
    if (effectiveWorktree) {
      const path = await ensureHealthy(effectiveWorktree, repoDir)
      store.lockTask(taskId, effectiveWorktree.worktreeId)
      return path
    }

    // No worktree anywhere — create on THIS task
    return createWorktreeForTask(taskId, repoDir, creatingRef)
  }, [])

  const createWorktreeNow = useCallback(async (taskId: string): Promise<void> => {
    const store = useTaskStore.getState()
    const task = store.getTask(taskId)
    if (!task || task.worktreeLocked || task.worktree) return

    const repoDir = store.getEffectiveDirectory(taskId)
    if (!repoDir) return

    await createWorktreeForTask(taskId, repoDir, creatingRef)
  }, [])

  const clearWorktreeWarning = useCallback(() => setWorktreeWarning(null), [])

  return {
    resolveSessionCwd,
    createWorktreeNow,
    worktreeWarning,
    clearWorktreeWarning
  }
}

/** Create a worktree for a task, set mode to own-worktree, and lock. */
async function createWorktreeForTask(
  taskId: string,
  repoDir: string,
  creatingRef: React.MutableRefObject<Set<string>>
): Promise<string> {
  if (creatingRef.current.has(taskId)) {
    const created = await waitForWorktree(taskId, 15_000)
    return created?.path ?? repoDir
  }

  creatingRef.current.add(taskId)
  try {
    const store = useTaskStore.getState()
    const worktree = await window.api.worktreeCreate(
      repoDir,
      store.settings.worktreeBaseDir,
      taskId
    )
    store.createAndLockWorktree(taskId, worktree)
    return worktree.path
  } catch (err) {
    window.api.logError('Failed to create worktree', err instanceof Error ? err.stack : String(err))
    return repoDir
  } finally {
    creatingRef.current.delete(taskId)
  }
}

/** Poll store until the task has a worktree record, or timeout. */
async function waitForWorktree(
  taskId: string,
  timeoutMs: number
): Promise<WorktreeRecord | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const wt = useTaskStore.getState().getTask(taskId)?.worktree
    if (wt) return wt
    await new Promise((r) => setTimeout(r, 200))
  }
  return undefined
}
