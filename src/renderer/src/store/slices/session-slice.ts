import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'

export interface SessionSlice {
  activeSessions: Set<string>

  startSession: (id: string) => void
  stopSession: (id: string) => void
  hasActiveSession: (id: string) => boolean
}

export const createSessionSlice: StateCreator<FullStore, [], [], SessionSlice> = (set, get) => ({
  activeSessions: new Set(),

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

  hasActiveSession: (id) => get().activeSessions.has(id)
})
