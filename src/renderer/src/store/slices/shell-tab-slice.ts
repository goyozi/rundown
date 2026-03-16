import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'

export type DetailTab = 'claude' | 'review' | `shell:${string}`

export interface ShellTab {
  id: string
  label: string
  sessionId: string
}

export interface ShellTabSlice {
  tabPerTask: Record<string, DetailTab>
  shellTabsPerTask: Record<string, ShellTab[]>

  getActiveTab: (taskId: string) => DetailTab
  setActiveTab: (taskId: string, tab: DetailTab) => void
  getShellTabs: (taskId: string) => ShellTab[]
  addShellTab: (taskId: string, tab: ShellTab) => void
  removeShellTab: (taskId: string, shellTabId: string) => void
  cleanupExitedShell: (sessionId: string) => void
}

export const createShellTabSlice: StateCreator<FullStore, [], [], ShellTabSlice> = (set, get) => ({
  tabPerTask: {},
  shellTabsPerTask: {},

  getActiveTab: (taskId) => get().tabPerTask[taskId] || 'claude',

  setActiveTab: (taskId, tab) => {
    set((state) => ({
      tabPerTask: { ...state.tabPerTask, [taskId]: tab }
    }))
  },

  getShellTabs: (taskId) => get().shellTabsPerTask[taskId] || [],

  addShellTab: (taskId, tab) => {
    set((state) => ({
      shellTabsPerTask: {
        ...state.shellTabsPerTask,
        [taskId]: [...(state.shellTabsPerTask[taskId] || []), tab]
      }
    }))
  },

  removeShellTab: (taskId, shellTabId) => {
    set((state) => ({
      shellTabsPerTask: {
        ...state.shellTabsPerTask,
        [taskId]: (state.shellTabsPerTask[taskId] || []).filter((t) => t.id !== shellTabId)
      }
    }))
  },

  cleanupExitedShell: (exitedSessionId) => {
    if (!exitedSessionId.includes(':shell-')) return

    set((state) => {
      const updatedShellTabs = { ...state.shellTabsPerTask }
      const updatedTabs = { ...state.tabPerTask }

      for (const [taskId, tabs] of Object.entries(updatedShellTabs)) {
        const match = tabs.find((t) => t.sessionId === exitedSessionId)
        if (match) {
          updatedShellTabs[taskId] = tabs.filter((t) => t.id !== match.id)

          const currentTab = updatedTabs[taskId]
          if (typeof currentTab === 'string' && currentTab === `shell:${match.id}`) {
            updatedTabs[taskId] = 'claude'
          }
          break
        }
      }

      return { shellTabsPerTask: updatedShellTabs, tabPerTask: updatedTabs }
    })
  }
})
