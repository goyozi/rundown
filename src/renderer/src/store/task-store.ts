import { create } from 'zustand'
import type { Task } from '../../../shared/types'

export type { Task }

interface TaskStore {
  tasks: Task[]
  selectedTaskId: string | null
  loaded: boolean
  activeSessions: Set<string>

  loadTasks: () => Promise<void>
  persist: () => Promise<void>

  addTask: (description: string, parentId?: string) => void
  updateDescription: (id: string, description: string) => void
  updateDirectory: (id: string, directory: string | undefined) => void
  deleteTask: (id: string) => void
  markDone: (id: string) => void
  markIdle: (id: string) => void
  selectTask: (id: string | null) => void

  startSession: (id: string) => void
  stopSession: (id: string) => void
  hasActiveSession: (id: string) => boolean

  getTask: (id: string) => Task | undefined
  getRootTasks: () => Task[]
  getChildren: (parentId: string) => Task[]
  getDepth: (id: string) => number
  getEffectiveDirectory: (id: string) => string | undefined
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  loaded: false,
  activeSessions: new Set(),

  loadTasks: async () => {
    const tasks = await window.api.getTasks()
    set({ tasks, loaded: true })
  },

  persist: async () => {
    await window.api.saveTasks(get().tasks)
  },

  addTask: (description, parentId) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (parentId) {
      const depth = get().getDepth(parentId)
      if (depth >= 4) return // parent is at depth 4, child would be 5 (0-indexed: max depth index 4 = level 5)
    }

    const newTask: Task = {
      id,
      description,
      state: 'idle',
      parentId,
      children: [],
      createdAt: now
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
      return { tasks }
    })

    get().persist()
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

    set((state) => {
      let tasks = state.tasks.filter((t) => !idsToRemove.has(t.id))
      if (task?.parentId) {
        tasks = tasks.map((t) =>
          t.id === task.parentId
            ? { ...t, children: t.children.filter((cid) => cid !== id) }
            : t
        )
      }
      const selectedTaskId =
        state.selectedTaskId && idsToRemove.has(state.selectedTaskId)
          ? null
          : state.selectedTaskId
      return { tasks, selectedTaskId }
    })
    get().persist()
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

  startSession: (id) => {
    set((state) => {
      const next = new Set(state.activeSessions)
      next.add(id)
      return { activeSessions: next }
    })
  },

  stopSession: (id) => {
    set((state) => {
      const next = new Set(state.activeSessions)
      next.delete(id)
      return { activeSessions: next }
    })
  },

  hasActiveSession: (id) => get().activeSessions.has(id),

  getTask: (id) => get().tasks.find((t) => t.id === id),

  getRootTasks: () => get().tasks.filter((t) => !t.parentId),

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
      if (!current.parentId) return undefined
      current = get().tasks.find((t) => t.id === current!.parentId)
    }
    return undefined
  }
}))
