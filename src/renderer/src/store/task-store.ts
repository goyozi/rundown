import { create } from 'zustand'
import type { Task, TaskGroup } from '../../../shared/types'

export type { Task, TaskGroup }

interface TaskStore {
  tasks: Task[]
  groups: TaskGroup[]
  activeGroupId: string
  selectedTaskId: string | null
  loaded: boolean
  activeSessions: Set<string>

  loadTasks: () => Promise<void>
  persist: () => Promise<void>
  persistGroups: () => Promise<void>

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

  // Group actions
  addGroup: (name: string) => void
  removeGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  setActiveGroup: (id: string) => void
  getActiveGroup: () => TaskGroup | undefined
  getGroupTaskCount: (groupId: string) => number
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  groups: [],
  activeGroupId: '',
  selectedTaskId: null,
  loaded: false,
  activeSessions: new Set(),

  loadTasks: async () => {
    const [tasks, groups, activeGroupId] = await Promise.all([
      window.api.getTasks(),
      window.api.getGroups(),
      window.api.getActiveGroupId()
    ])
    set({ tasks, groups, activeGroupId, loaded: true })
  },

  persist: async () => {
    await window.api.saveTasks(get().tasks)
  },

  persistGroups: async () => {
    await window.api.saveGroups(get().groups)
  },

  addTask: (description, parentId) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (parentId) {
      const depth = get().getDepth(parentId)
      if (depth >= 4) return
    }

    // Sub-tasks inherit groupId from parent; root tasks use activeGroupId
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
          t.id === task.parentId ? { ...t, children: t.children.filter((cid) => cid !== id) } : t
        )
      }
      const selectedTaskId =
        state.selectedTaskId && idsToRemove.has(state.selectedTaskId) ? null : state.selectedTaskId
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

  getRootTasks: () => get().tasks.filter((t) => !t.parentId && t.groupId === get().activeGroupId),

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
  },

  // Group actions

  addGroup: (name) => {
    const id = crypto.randomUUID()
    const newGroup: TaskGroup = {
      id,
      name,
      createdAt: new Date().toISOString()
    }
    set((state) => ({
      groups: [...state.groups, newGroup],
      activeGroupId: id
    }))
    get().persistGroups()
    window.api.saveActiveGroupId(id)
  },

  removeGroup: (id) => {
    const { groups, tasks, activeSessions, activeGroupId } = get()
    if (groups.length <= 1) return // cannot delete last group

    // Collect all task IDs in this group
    const groupTaskIds = tasks.filter((t) => t.groupId === id).map((t) => t.id)

    // Kill active sessions on those tasks
    for (const taskId of groupTaskIds) {
      if (activeSessions.has(taskId)) {
        window.api.ptyKill(taskId)
      }
    }

    const remainingGroups = groups.filter((g) => g.id !== id)
    const newActiveGroupId = activeGroupId === id ? remainingGroups[0].id : activeGroupId

    set((state) => ({
      groups: remainingGroups,
      tasks: state.tasks.filter((t) => t.groupId !== id),
      activeGroupId: newActiveGroupId,
      activeSessions: new Set(
        [...state.activeSessions].filter((sid) => !groupTaskIds.includes(sid))
      ),
      selectedTaskId:
        state.selectedTaskId && groupTaskIds.includes(state.selectedTaskId)
          ? null
          : state.selectedTaskId
    }))

    get().persist()
    get().persistGroups()
    window.api.saveActiveGroupId(newActiveGroupId)
  },

  renameGroup: (id, name) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g))
    }))
    get().persistGroups()
  },

  setActiveGroup: (id) => {
    set({ activeGroupId: id, selectedTaskId: null })
    window.api.saveActiveGroupId(id)
  },

  getActiveGroup: () => {
    const { groups, activeGroupId } = get()
    return groups.find((g) => g.id === activeGroupId)
  },

  getGroupTaskCount: (groupId) => {
    return get().tasks.filter((t) => t.groupId === groupId && !t.parentId).length
  }
}))
