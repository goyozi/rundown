import type { StateCreator } from 'zustand'
import type { AppSettings } from '../../../../shared/types'
import type { FullStore } from '../task-store'

export interface SettingsSlice {
  settings: AppSettings
  loadSettings: () => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => void
  setSessionResume: (enabled: boolean) => void
}

export const createSettingsSlice: StateCreator<FullStore, [], [], SettingsSlice> = (set, get) => ({
  settings: {
    theme: 'system',
    worktreesEnabled: false,
    worktreeBaseDir: '~/rundown/worktrees/',
    sessionResume: false
  },

  loadSettings: async () => {
    try {
      const settings = await window.api.getSettings()
      set({ settings })
    } catch (err) {
      window.api.logError('Failed to load settings', err instanceof Error ? err.stack : String(err))
    }
  },

  updateSettings: (partial) => {
    const current = get().settings
    const updated = { ...current, ...partial }
    set({ settings: updated })
    window.api.saveSettings(updated).catch((err) => {
      window.api.logError(
        'Failed to persist settings',
        err instanceof Error ? err.stack : String(err)
      )
    })
  },

  setSessionResume: (enabled) => {
    const previous = get().settings.sessionResume
    set({ settings: { ...get().settings, sessionResume: enabled } })
    window.api.setSessionResume(enabled).catch((err) => {
      // Revert to the value before this call, not !enabled, to avoid races
      set({ settings: { ...get().settings, sessionResume: previous } })
      window.api.logError(
        'Failed to set session resume',
        err instanceof Error ? err.stack : String(err)
      )
    })
  }
})
