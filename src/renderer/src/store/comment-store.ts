import { create } from 'zustand'

export interface Comment {
  id: string
  filePath: string
  changeKey: string // react-diff-view change key (e.g. "I5", "D3", "N10")
  lineNumber: number
  body: string
}

interface CommentStore {
  // Map<taskId, Comment[]>
  pool: Record<string, Comment[]>

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
  },

  updateComment: (taskId, commentId, body) => {
    set((state) => ({
      pool: {
        ...state.pool,
        [taskId]: (state.pool[taskId] ?? []).map((c) => (c.id === commentId ? { ...c, body } : c))
      }
    }))
  },

  removeComment: (taskId, commentId) => {
    set((state) => ({
      pool: {
        ...state.pool,
        [taskId]: (state.pool[taskId] ?? []).filter((c) => c.id !== commentId)
      }
    }))
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
