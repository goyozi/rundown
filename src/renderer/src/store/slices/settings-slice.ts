import type { StateCreator } from 'zustand'
import type { AppSettings } from '../../../../shared/types'
import type { FullStore } from '../task-store'

export interface SettingsSlice {
  settings: AppSettings
  loadSettings: () => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => void
}

export const createSettingsSlice: StateCreator<FullStore, [], [], SettingsSlice> = (set, get) => ({
  settings: {
    theme: 'system',
    worktreesEnabled: false,
    worktreeBaseDir: '~/rundown/worktrees/'
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
  }
})
