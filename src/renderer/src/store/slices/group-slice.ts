import type { StateCreator } from 'zustand'
import type { TaskGroup } from '../../../../shared/types'
import type { FullStore } from '../task-store'
import { useCommentStore } from '../comment-store'

export interface GroupSlice {
  groups: TaskGroup[]
  activeGroupId: string
  rootTaskOrder: Record<string, string[]>

  addGroup: (name: string) => void
  removeGroup: (id: string) => void
  renameGroup: (id: string, name: string) => void
  updateGroupDirectory: (id: string, directory: string | undefined) => void
  setActiveGroup: (id: string) => void
  getActiveGroup: () => TaskGroup | undefined
  getGroupTaskCount: (groupId: string) => number
}

export const createGroupSlice: StateCreator<FullStore, [], [], GroupSlice> = (set, get) => ({
  groups: [],
  activeGroupId: '',
  rootTaskOrder: {},

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
    if (groups.length <= 1) return

    const groupTaskIds = tasks.filter((t) => t.groupId === id).map((t) => t.id)

    // Clean up comments for all tasks in this group
    const commentStore = useCommentStore.getState()
    for (const taskId of groupTaskIds) {
      commentStore.clearComments(taskId)
    }

    const { shellTabsPerTask } = get()
    for (const taskId of groupTaskIds) {
      if (activeSessions.has(taskId)) {
        window.api.ptyKill(taskId).catch((err) => {
          window.api.logError(
            `Failed to kill session ${taskId} during group removal`,
            err instanceof Error ? err.stack : String(err)
          )
        })
      }
      // Kill any shell tab processes
      const shellTabs = shellTabsPerTask[taskId] ?? []
      for (const tab of shellTabs) {
        window.api.ptyKill(tab.sessionId).catch((err) => {
          window.api.logError(
            `Failed to kill shell session ${tab.sessionId} during group removal`,
            err instanceof Error ? err.stack : String(err)
          )
        })
      }
    }

    const remainingGroups = groups.filter((g) => g.id !== id)
    const newActiveGroupId = activeGroupId === id ? remainingGroups[0].id : activeGroupId

    set((state) => {
      const rootTaskOrder = { ...state.rootTaskOrder }
      delete rootTaskOrder[id]

      const updatedShellTabs = { ...state.shellTabsPerTask }
      for (const taskId of groupTaskIds) {
        delete updatedShellTabs[taskId]
      }

      return {
        groups: remainingGroups,
        tasks: state.tasks.filter((t) => t.groupId !== id),
        activeGroupId: newActiveGroupId,
        activeSessions: new Set(
          [...state.activeSessions].filter((sid) => !groupTaskIds.includes(sid))
        ),
        selectedTaskId:
          state.selectedTaskId && groupTaskIds.includes(state.selectedTaskId)
            ? null
            : state.selectedTaskId,
        shellTabsPerTask: updatedShellTabs,
        rootTaskOrder
      }
    })

    get().persist()
    get().persistGroups()
    get().persistRootTaskOrder()
    window.api.saveActiveGroupId(newActiveGroupId)
  },

  renameGroup: (id, name) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, name } : g))
    }))
    get().persistGroups()
  },

  updateGroupDirectory: (id, directory) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === id ? { ...g, directory } : g))
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
})
