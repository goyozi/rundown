import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'

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
    if (!hasChildren && !get().activeSessions.has(taskId)) {
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
    if (get().activeSessions.has(taskId)) {
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
      get().markDone(op.taskId)
    }
  },

  cancelOperation: () => {
    set({ pendingOperation: null })
  }
})
