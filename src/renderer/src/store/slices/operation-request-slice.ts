import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'
import { collectTaskIds } from '../../lib/task-utils'

interface OperationRequest {
  type: 'delete' | 'markDone'
  taskId: string
}

export interface OperationRequestSlice {
  pendingOperation: OperationRequest | null
  requestDelete: (taskId: string) => void
  requestMarkDone: (taskId: string) => void
  confirmOperation: () => Promise<void>
  cancelOperation: () => void
}

export const createOperationRequestSlice: StateCreator<FullStore, [], [], OperationRequestSlice> = (
  set,
  get
) => ({
  pendingOperation: null,

  requestDelete: (taskId) => {
    const task = get().getTask(taskId)
    if (!task) return
    const hasChildren = get().getChildren(taskId).length > 0
    const hasShellTabs = (get().shellTabsPerTask[taskId] ?? []).length > 0

    // Check if any task in the deletion set owns a worktree
    const allIds = collectTaskIds(taskId, get().getTask)
    const hasWorktrees = allIds.some((id) => get().getTask(id)?.worktree != null)

    if (!hasChildren && !get().activeSessions.has(taskId) && !hasShellTabs && !hasWorktrees) {
      // No confirmation needed — delete immediately
      get().deleteTask(taskId)
      return
    }
    set({ pendingOperation: { type: 'delete', taskId } })
  },

  requestMarkDone: (taskId) => {
    const task = get().getTask(taskId)
    if (!task) return
    if (task.state === 'done') {
      get().markIdle(taskId)
      return
    }
    const hasShellTabs = (get().shellTabsPerTask[taskId] ?? []).length > 0
    if (get().activeSessions.has(taskId) || hasShellTabs) {
      // Needs confirmation — session is active
      set({ pendingOperation: { type: 'markDone', taskId } })
      return
    }
    get().markDone(taskId)
  },

  confirmOperation: async () => {
    const op = get().pendingOperation
    if (!op) return
    set({ pendingOperation: null })

    if (op.type === 'delete') {
      get().deleteTask(op.taskId)
    } else if (op.type === 'markDone') {
      try {
        await window.api.ptyKill(op.taskId)
      } catch {
        // Process may have already exited
      }
      get().stopSession(op.taskId)
      // Kill any shell tab processes
      const shellTabs = get().shellTabsPerTask[op.taskId] ?? []
      for (const tab of shellTabs) {
        try {
          await window.api.ptyKill(tab.sessionId)
        } catch {
          // Process may have already exited
        }
        get().removeShellTab(op.taskId, tab.id)
      }
      get().markDone(op.taskId)
    }
  },

  cancelOperation: () => {
    set({ pendingOperation: null })
  }
})
