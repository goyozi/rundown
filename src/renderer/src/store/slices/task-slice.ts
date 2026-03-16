import type { StateCreator } from 'zustand'
import type { Task } from '../../../../shared/types'
import type { FullStore } from '../task-store'
import { useCommentStore } from '../comment-store'

export interface TaskSlice {
  tasks: Task[]
  selectedTaskId: string | null
  loaded: boolean

  addTask: (description: string, parentId?: string) => void
  updateDescription: (id: string, description: string) => void
  updateDirectory: (id: string, directory: string | undefined) => void
  deleteTask: (id: string) => void
  markDone: (id: string) => void
  markIdle: (id: string) => void
  selectTask: (id: string | null) => void
  moveTask: (taskId: string, newParentId: string | undefined, index: number) => void

  getTask: (id: string) => Task | undefined
  getRootTasks: () => Task[]
  getChildren: (parentId: string) => Task[]
  getDepth: (id: string) => number
  getEffectiveDirectory: (id: string) => string | undefined
  isDescendant: (ancestorId: string, descendantId: string) => boolean
  getMaxSubtreeDepth: (id: string) => number
}

export const createTaskSlice: StateCreator<FullStore, [], [], TaskSlice> = (set, get) => ({
  tasks: [],
  selectedTaskId: null,
  loaded: false,

  addTask: (description, parentId) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (parentId) {
      const depth = get().getDepth(parentId)
      if (depth >= 4) return
    }

    const groupId = parentId
      ? (get().tasks.find((t) => t.id === parentId)?.groupId ?? get().activeGroupId)
      : get().activeGroupId

    const newTask: Task = {
      id,
      description,
      state: 'idle',
      parentId,
      children: [],
      createdAt: now,
      groupId
    }

    set((state) => {
      const tasks = [...state.tasks, newTask]
      if (parentId) {
        const parentIndex = tasks.findIndex((t) => t.id === parentId)
        if (parentIndex !== -1) {
          tasks[parentIndex] = {
            ...tasks[parentIndex],
            children: [...tasks[parentIndex].children, id]
          }
        }
      }

      const rootTaskOrder = { ...state.rootTaskOrder }
      if (!parentId) {
        const order = rootTaskOrder[groupId] ?? []
        rootTaskOrder[groupId] = [...order, id]
      }

      return { tasks, rootTaskOrder }
    })

    get().persist()
    if (!parentId) {
      get().persistRootTaskOrder()
    }
  },

  updateDescription: (id, description) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, description } : t))
    }))
    get().persist()
  },

  updateDirectory: (id, directory) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, directory } : t))
    }))
    get().persist()
  },

  deleteTask: (id) => {
    const collectIds = (taskId: string): string[] => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return []
      const childIds = task.children.flatMap(collectIds)
      return [taskId, ...childIds]
    }

    const idsToRemove = new Set(collectIds(id))
    const task = get().tasks.find((t) => t.id === id)

    // Clean up comments for deleted tasks
    const commentStore = useCommentStore.getState()
    for (const taskId of idsToRemove) {
      commentStore.clearComments(taskId)
    }

    // Kill active sessions (Claude + shell tabs) for the task and all its descendants
    const { activeSessions, stopSession, shellTabsPerTask, removeShellTab } = get()
    for (const taskId of idsToRemove) {
      if (activeSessions.has(taskId)) {
        window.api.ptyKill(taskId).catch((err) => {
          window.api.logError(
            `Failed to kill session ${taskId} during task deletion`,
            err instanceof Error ? err.stack : String(err)
          )
        })
        stopSession(taskId)
      }
      // Kill any shell tab processes
      const shellTabs = shellTabsPerTask[taskId] ?? []
      for (const tab of shellTabs) {
        window.api.ptyKill(tab.sessionId).catch((err) => {
          window.api.logError(
            `Failed to kill shell session ${tab.sessionId} during task deletion`,
            err instanceof Error ? err.stack : String(err)
          )
        })
        removeShellTab(taskId, tab.id)
      }
    }

    set((state) => {
      let tasks = state.tasks.filter((t) => !idsToRemove.has(t.id))
      if (task?.parentId) {
        tasks = tasks.map((t) =>
          t.id === task.parentId ? { ...t, children: t.children.filter((cid) => cid !== id) } : t
        )
      }
      const selectedTaskId =
        state.selectedTaskId && idsToRemove.has(state.selectedTaskId) ? null : state.selectedTaskId

      const rootTaskOrder = { ...state.rootTaskOrder }
      if (!task?.parentId && task?.groupId) {
        const order = rootTaskOrder[task.groupId]
        if (order) {
          rootTaskOrder[task.groupId] = order.filter((tid) => tid !== id)
        }
      }

      return { tasks, selectedTaskId, rootTaskOrder }
    })
    get().persist()
    if (!task?.parentId) {
      get().persistRootTaskOrder()
    }
  },

  moveTask: (taskId, newParentId, index) => {
    const { tasks, isDescendant, getDepth, getMaxSubtreeDepth } = get()
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    if (newParentId === taskId) return
    if (newParentId && isDescendant(taskId, newParentId)) return

    if (newParentId) {
      const newParentDepth = getDepth(newParentId) + 1
      const subtreeDepth = getMaxSubtreeDepth(taskId)
      if (newParentDepth + subtreeDepth > 4) return
    }

    const oldParentId = task.parentId

    set((state) => {
      let updatedTasks = [...state.tasks]
      const rootTaskOrder = { ...state.rootTaskOrder }
      const groupId = task.groupId

      if (oldParentId) {
        updatedTasks = updatedTasks.map((t) =>
          t.id === oldParentId ? { ...t, children: t.children.filter((cid) => cid !== taskId) } : t
        )
      } else {
        const order = rootTaskOrder[groupId] ?? []
        rootTaskOrder[groupId] = order.filter((tid) => tid !== taskId)
      }

      updatedTasks = updatedTasks.map((t) =>
        t.id === taskId ? { ...t, parentId: newParentId || undefined } : t
      )

      if (newParentId) {
        updatedTasks = updatedTasks.map((t) => {
          if (t.id === newParentId) {
            const children = [...t.children]
            children.splice(index, 0, taskId)
            return { ...t, children }
          }
          return t
        })
      } else {
        const order = rootTaskOrder[groupId] ?? []
        order.splice(index, 0, taskId)
        rootTaskOrder[groupId] = order
      }

      return { tasks: updatedTasks, rootTaskOrder }
    })

    get().persist()
    get().persistRootTaskOrder()
  },

  markDone: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, state: 'done' as const } : t))
    }))
    get().persist()
  },

  markIdle: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, state: 'idle' as const } : t))
    }))
    get().persist()
  },

  selectTask: (id) => {
    set({ selectedTaskId: id })
  },

  getTask: (id) => get().tasks.find((t) => t.id === id),

  getRootTasks: () => {
    const { tasks, rootTaskOrder, activeGroupId } = get()
    const order = rootTaskOrder[activeGroupId]
    const rootTasks = tasks.filter((t) => !t.parentId && t.groupId === activeGroupId)

    if (!order || order.length === 0) return rootTasks

    const orderedSet = new Set(order)
    const ordered = order
      .map((id) => rootTasks.find((t) => t.id === id))
      .filter((t): t is Task => t !== undefined)
    const unordered = rootTasks.filter((t) => !orderedSet.has(t.id))
    return [...ordered, ...unordered]
  },

  getChildren: (parentId) => {
    const parent = get().tasks.find((t) => t.id === parentId)
    if (!parent) return []
    return parent.children
      .map((cid) => get().tasks.find((t) => t.id === cid))
      .filter((t): t is Task => t !== undefined)
  },

  getDepth: (id) => {
    let depth = 0
    let current = get().tasks.find((t) => t.id === id)
    while (current?.parentId) {
      depth++
      current = get().tasks.find((t) => t.id === current!.parentId)
    }
    return depth
  },

  getEffectiveDirectory: (id) => {
    let current = get().tasks.find((t) => t.id === id)
    while (current) {
      if (current.directory) return current.directory
      if (!current.parentId) {
        const group = get().groups.find((g) => g.id === current!.groupId)
        return group?.directory
      }
      current = get().tasks.find((t) => t.id === current!.parentId)
    }
    return undefined
  },

  isDescendant: (ancestorId, candidateId) => {
    const { tasks } = get()
    let current = tasks.find((t) => t.id === candidateId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true
      current = tasks.find((t) => t.id === current!.parentId)
    }
    return false
  },

  getMaxSubtreeDepth: (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task || task.children.length === 0) return 0
    return 1 + Math.max(...task.children.map((cid) => get().getMaxSubtreeDepth(cid)))
  }
})
