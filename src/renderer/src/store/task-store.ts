import { create } from 'zustand'
import type { Task, TaskGroup } from '../../../shared/types'
import { debouncedLeadingTrailing } from '../lib/debounce'
import { initThemeFromSettings } from '../hooks/use-theme'
import { createTaskSlice, type TaskSlice } from './slices/task-slice'
import { createGroupSlice, type GroupSlice } from './slices/group-slice'
import { createSessionSlice, type SessionSlice } from './slices/session-slice'
import { createShellTabSlice, type ShellTabSlice } from './slices/shell-tab-slice'
import {
  createOperationRequestSlice,
  type OperationRequestSlice
} from './slices/operation-request-slice'
import { createSettingsSlice, type SettingsSlice } from './slices/settings-slice'
import { createShortcutSlice, type ShortcutSlice } from './slices/shortcut-slice'
import { createNavigationSlice, type NavigationSlice } from './slices/navigation-slice'

export type { Task, TaskGroup }

interface PersistenceSlice {
  loadError: string | null
  loadTasks: () => Promise<void>
  persist: () => void
  persistGroups: () => void
  persistRootTaskOrder: () => void
  persistShortcuts: () => void
}

export type FullStore = TaskSlice &
  GroupSlice &
  SessionSlice &
  ShellTabSlice &
  OperationRequestSlice &
  SettingsSlice &
  ShortcutSlice &
  NavigationSlice &
  PersistenceSlice

export const useTaskStore = create<FullStore>((...a) => {
  const [set, get] = a

  return {
    ...createTaskSlice(...a),
    ...createGroupSlice(...a),
    ...createSessionSlice(...a),
    ...createShellTabSlice(...a),
    ...createOperationRequestSlice(...a),
    ...createSettingsSlice(...a),
    ...createShortcutSlice(...a),
    ...createNavigationSlice(...a),

    loadError: null,

    loadTasks: async () => {
      try {
        set({ loadError: null })
        const [tasks, groups, activeGroupId, rootTaskOrder, settings, shortcuts] =
          await Promise.all([
            window.api.getTasks(),
            window.api.getGroups(),
            window.api.getActiveGroupId(),
            window.api.getRootTaskOrder(),
            window.api.getSettings(),
            window.api.getShortcuts()
          ])
        set({ tasks, groups, activeGroupId, rootTaskOrder, settings, shortcuts, loaded: true })
        initThemeFromSettings(settings.theme)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set({ loadError: message })
      }
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
    }),

    persistShortcuts: debouncedLeadingTrailing(async () => {
      try {
        await window.api.saveShortcuts(get().shortcuts)
      } catch (err) {
        window.api.logError(
          'Failed to persist shortcuts',
          err instanceof Error ? err.stack : String(err)
        )
      }
    })
  }
})
