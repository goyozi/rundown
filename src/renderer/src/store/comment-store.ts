import { create } from 'zustand'
import type { Comment } from '../../../shared/types'
import { debouncedLeadingTrailing } from '../lib/debounce'

export type { Comment }

interface CommentStore {
  // Map<taskId, Comment[]>
  pool: Record<string, Comment[]>
  loaded: boolean

  loadComments: () => Promise<void>
  persist: () => void

  addComment: (taskId: string, filePath: string, changeKey: string, lineNumber: number) => void
  updateComment: (taskId: string, commentId: string, body: string) => void
  removeComment: (taskId: string, commentId: string) => void
  getComments: (taskId: string) => Comment[]
  getCommentsForFile: (taskId: string, filePath: string) => Comment[]
  clearComments: (taskId: string) => void
  getCommentCount: (taskId: string) => number
  getWidgets: (taskId: string, filePath: string) => Record<string, Comment>
}

export const useCommentStore = create<CommentStore>((set, get) => ({
  pool: {},
  loaded: false,

  loadComments: async () => {
    const pool = await window.api.getComments()
    set({ pool, loaded: true })
  },

  persist: debouncedLeadingTrailing(async () => {
    try {
      await window.api.saveComments(get().pool)
    } catch (err) {
      window.api.logError(
        'Failed to persist comments',
        err instanceof Error ? err.stack : String(err)
      )
    }
  }),

  addComment: (taskId, filePath, changeKey, lineNumber) => {
    const comment: Comment = {
      id: crypto.randomUUID(),
      filePath,
      changeKey,
      lineNumber,
      body: ''
    }
    set((state) => ({
      pool: {
        ...state.pool,
        [taskId]: [...(state.pool[taskId] ?? []), comment]
      }
    }))
    get().persist()
  },

  updateComment: (taskId, commentId, body) => {
    set((state) => ({
      pool: {
        ...state.pool,
        [taskId]: (state.pool[taskId] ?? []).map((c) => (c.id === commentId ? { ...c, body } : c))
      }
    }))
    get().persist()
  },

  removeComment: (taskId, commentId) => {
    set((state) => ({
      pool: {
        ...state.pool,
        [taskId]: (state.pool[taskId] ?? []).filter((c) => c.id !== commentId)
      }
    }))
    get().persist()
  },

  getComments: (taskId) => get().pool[taskId] ?? [],

  getCommentsForFile: (taskId, filePath) =>
    (get().pool[taskId] ?? []).filter((c) => c.filePath === filePath),

  clearComments: (taskId) => {
    set((state) => {
      const next = { ...state.pool }
      delete next[taskId]
      return { pool: next }
    })
    get().persist()
  },

  getCommentCount: (taskId) => (get().pool[taskId] ?? []).length,

  getWidgets: (taskId, filePath) => {
    const comments = (get().pool[taskId] ?? []).filter((c) => c.filePath === filePath)
    const result: Record<string, Comment> = {}
    for (const c of comments) {
      result[c.changeKey] = c
    }
    return result
  }
}))
