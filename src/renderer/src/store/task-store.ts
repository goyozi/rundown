import { create } from 'zustand'
import type { Task, TaskGroup } from '../../../shared/types'
import { debouncedLeadingTrailing } from '../lib/debounce'
import { createTaskSlice, type TaskSlice } from './slices/task-slice'
import { createGroupSlice, type GroupSlice } from './slices/group-slice'
import { createSessionSlice, type SessionSlice } from './slices/session-slice'

export type { Task, TaskGroup }

interface PersistenceSlice {
  loadTasks: () => Promise<void>
  persist: () => void
  persistGroups: () => void
  persistRootTaskOrder: () => void
}

export type FullStore = TaskSlice & GroupSlice & SessionSlice & PersistenceSlice

export const useTaskStore = create<FullStore>((...a) => {
  const [set, get] = a

  return {
    ...createTaskSlice(...a),
    ...createGroupSlice(...a),
    ...createSessionSlice(...a),

    loadTasks: async () => {
      const [tasks, groups, activeGroupId, rootTaskOrder] = await Promise.all([
        window.api.getTasks(),
        window.api.getGroups(),
        window.api.getActiveGroupId(),
        window.api.getRootTaskOrder()
      ])
      set({ tasks, groups, activeGroupId, rootTaskOrder, loaded: true })
    },

    persist: debouncedLeadingTrailing(async () => {
      try {
        await window.api.saveTasks(get().tasks)
      } catch (err) {
        window.api.logError(
          'Failed to persist tasks',
          err instanceof Error ? err.stack : String(err)
        )
      }
    }),

    persistGroups: debouncedLeadingTrailing(async () => {
      try {
        await window.api.saveGroups(get().groups)
      } catch (err) {
        window.api.logError(
          'Failed to persist groups',
          err instanceof Error ? err.stack : String(err)
        )
      }
    }),

    persistRootTaskOrder: debouncedLeadingTrailing(async () => {
      try {
        await window.api.saveRootTaskOrder(get().rootTaskOrder)
      } catch (err) {
        window.api.logError(
          'Failed to persist root task order',
          err instanceof Error ? err.stack : String(err)
        )
      }
    })
  }
})
