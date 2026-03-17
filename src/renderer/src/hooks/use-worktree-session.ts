import { useCallback, useRef, useState } from 'react'
import { useTaskStore } from '@/store/task-store'
import type { WorktreeRecord } from '../../../shared/types'

/**
 * Encapsulates worktree lifecycle orchestration: resolving the session CWD
 * (with health-check, repair, and lazy creation), toggling own-worktree,
 * and a mutex that prevents concurrent worktree creation races.
 */
export function useWorktreeSession(): {
  resolveSessionCwd: (taskId: string) => Promise<string | undefined>
  toggleOwnWorktree: (taskId: string) => Promise<void>
  isTogglingWorktree: boolean
  worktreeWarning: string | null
  clearWorktreeWarning: () => void
} {
  const [isTogglingWorktree, setIsTogglingWorktree] = useState(false)
  const [worktreeWarning, setWorktreeWarning] = useState<string | null>(null)
  // Mutex: keyed by owner task ID to prevent concurrent creation for the same worktree
  const creatingRef = useRef<Set<string>>(new Set())

  const resolveSessionCwd = useCallback(async (taskId: string): Promise<string | undefined> => {
    const store = useTaskStore.getState()
    const repoDir = store.getEffectiveDirectory(taskId)
    if (!repoDir) return undefined

    if (!store.settings.worktreesEnabled) return repoDir

    // Check for existing worktree
    const existingWorktree = store.getEffectiveWorktree(taskId)
    if (existingWorktree) {
      return ensureHealthy(existingWorktree, taskId, repoDir)
    }

    // No worktree — create one on the owner task
    const ownerTaskId = store.getWorktreeOwnerTaskId(taskId)
    if (!ownerTaskId) return repoDir

    // Mutex: if another call is already creating for this owner, wait
    if (creatingRef.current.has(ownerTaskId)) {
      // Poll until the other creation finishes (or timeout after 15s)
      const created = await waitForWorktree(ownerTaskId, 15_000)
      return created?.path ?? repoDir
    }

    creatingRef.current.add(ownerTaskId)
    try {
      const worktree = await window.api.worktreeCreate(
        repoDir,
        store.settings.worktreeBaseDir,
        ownerTaskId
      )
      store.setWorktreeOnTask(ownerTaskId, worktree)
      return worktree.path
    } catch (err) {
      window.api.logError(
        'Failed to create worktree',
        err instanceof Error ? err.stack : String(err)
      )
      return repoDir
    } finally {
      creatingRef.current.delete(ownerTaskId)
    }
  }, [])

  const ensureHealthy = async (
    worktree: WorktreeRecord,
    taskId: string,
    repoDir: string
  ): Promise<string> => {
    const store = useTaskStore.getState()
    const health = await window.api.worktreeEnsureHealthy(worktree)
    if (health.healthy) {
      if (health.repaired) {
        const ownerTaskId = store.getWorktreeOwnerTaskId(taskId)
        if (ownerTaskId) store.setWorktreeOnTask(ownerTaskId, health.repaired)
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

  const toggleOwnWorktree = useCallback(async (taskId: string): Promise<void> => {
    const store = useTaskStore.getState()
    const task = store.getTask(taskId)
    if (!task) return

    setIsTogglingWorktree(true)
    try {
      if (task.inheritWorktree !== false) {
        // Opt out of inheritance
        store.setInheritWorktree(taskId, false)
      } else {
        // Revert to inheriting — clean up owned worktree if present
        if (task.worktree) {
          await window.api.worktreeCleanup(task.worktree)
          store.clearWorktreeOnTask(taskId)
        }
        store.setInheritWorktree(taskId, true)
      }
    } catch (err) {
      window.api.logError(
        'Failed to toggle worktree',
        err instanceof Error ? err.stack : String(err)
      )
    } finally {
      setIsTogglingWorktree(false)
    }
  }, [])

  const clearWorktreeWarning = useCallback(() => setWorktreeWarning(null), [])

  return {
    resolveSessionCwd,
    toggleOwnWorktree,
    isTogglingWorktree,
    worktreeWarning,
    clearWorktreeWarning
  }
}

/** Poll store until the owner task has a worktree record, or timeout. */
async function waitForWorktree(
  ownerTaskId: string,
  timeoutMs: number
): Promise<WorktreeRecord | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const wt = useTaskStore.getState().getTask(ownerTaskId)?.worktree
    if (wt) return wt
    await new Promise((r) => setTimeout(r, 200))
  }
  return undefined
}
