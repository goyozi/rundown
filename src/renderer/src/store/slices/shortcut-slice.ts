import type { StateCreator } from 'zustand'
import type { Shortcut } from '../../../../shared/types'
import type { FullStore } from '../task-store'

export interface ShortcutSlice {
  shortcuts: Shortcut[]
  addShortcut: (shortcut: Omit<Shortcut, 'id' | 'order'>) => void
  updateShortcut: (id: string, partial: Partial<Omit<Shortcut, 'id'>>) => void
  deleteShortcut: (id: string) => void
  reorderShortcuts: (orderedIds: string[]) => void
}

export const createShortcutSlice: StateCreator<FullStore, [], [], ShortcutSlice> = (set, get) => ({
  shortcuts: [],

  addShortcut: (shortcut) => {
    const current = get().shortcuts
    const newShortcut: Shortcut = {
      ...shortcut,
      id: crypto.randomUUID(),
      order: current.length
    }
    set({ shortcuts: [...current, newShortcut] })
    get().persistShortcuts()
  },

  updateShortcut: (id, partial) => {
    set({
      shortcuts: get().shortcuts.map((s) => (s.id === id ? { ...s, ...partial } : s))
    })
    get().persistShortcuts()
  },

  deleteShortcut: (id) => {
    const filtered = get()
      .shortcuts.filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, order: i }))
    set({ shortcuts: filtered })
    get().persistShortcuts()
  },

  reorderShortcuts: (orderedIds) => {
    const current = get().shortcuts
    const byId = new Map(current.map((s) => [s.id, s]))
    const reordered = orderedIds
      .map((id, i) => {
        const s = byId.get(id)
        return s ? { ...s, order: i } : undefined
      })
      .filter((s): s is Shortcut => s !== undefined)
    set({ shortcuts: reordered })
    get().persistShortcuts()
  }
})
