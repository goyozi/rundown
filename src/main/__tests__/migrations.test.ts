import { describe, it, expect } from 'vitest'
import { runMigrations, type StoreAccess } from '../migrations'

function createMockStore(data: Record<string, unknown>): StoreAccess {
  const store = { ...data }
  return {
    get(key: string): unknown {
      return store[key]
    },
    set(key: string, value: unknown): void {
      store[key] = value
    }
  } as StoreAccess
}

describe('Migration v6', () => {
  const baseStore = (overrides: Record<string, unknown> = {}): StoreAccess =>
    createMockStore({
      schemaVersion: 5,
      tasks: [],
      groups: [{ id: 'g1', name: 'Rundown', createdAt: '2025-01-01' }],
      rootTaskOrder: {},
      comments: {},
      settings: {
        theme: 'system',
        worktreesEnabled: false,
        worktreeBaseDir: '~/.rundown/worktrees/',
        sessionResume: false
      },
      ...overrides
    })

  it('migrates worktreesEnabled: true → defaultWorktreeMode: own-worktree', () => {
    const store = baseStore({
      settings: {
        theme: 'system',
        worktreesEnabled: true,
        worktreeBaseDir: '~/wt/',
        sessionResume: false
      }
    })
    runMigrations(store)
    const settings = store.get('settings') as Record<string, unknown>
    expect(settings.defaultWorktreeMode).toBe('own-worktree')
    expect(settings).not.toHaveProperty('worktreesEnabled')
  })

  it('migrates worktreesEnabled: false → defaultWorktreeMode: no-worktree', () => {
    const store = baseStore()
    runMigrations(store)
    const settings = store.get('settings') as Record<string, unknown>
    expect(settings.defaultWorktreeMode).toBe('no-worktree')
    expect(settings).not.toHaveProperty('worktreesEnabled')
  })

  it('migrates inheritWorktree: false + worktree → own-worktree, locked', () => {
    const store = baseStore({
      tasks: [
        {
          id: 't1',
          description: 'test',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1',
          inheritWorktree: false,
          worktree: {
            worktreeId: 'w1',
            name: 'wt',
            path: '/tmp/wt',
            branchName: 'b',
            repoPath: '/repo',
            createdAt: '2025-01-01'
          }
        }
      ]
    })
    runMigrations(store)
    const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
    expect(tasks[0].worktreeMode).toBe('own-worktree')
    expect(tasks[0].worktreeLocked).toBe(true)
    expect(tasks[0].lockedToWorktreeId).toBe('w1')
    expect(tasks[0]).not.toHaveProperty('inheritWorktree')
  })

  it('migrates inheritWorktree: false + no worktree → own-worktree, unlocked', () => {
    const store = baseStore({
      tasks: [
        {
          id: 't1',
          description: 'test',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1',
          inheritWorktree: false
        }
      ]
    })
    runMigrations(store)
    const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
    expect(tasks[0].worktreeMode).toBe('own-worktree')
    expect(tasks[0].worktreeLocked).toBe(false)
    expect(tasks[0].lockedToWorktreeId).toBeUndefined()
  })

  it('migrates default (no inheritWorktree) + sessionId → inherit, locked (no lockedToWorktreeId)', () => {
    const store = baseStore({
      tasks: [
        {
          id: 't1',
          description: 'test',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1',
          sessionId: 'sess-1'
        }
      ]
    })
    runMigrations(store)
    const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
    expect(tasks[0].worktreeMode).toBe('inherit')
    expect(tasks[0].worktreeLocked).toBe(true)
    expect(tasks[0].lockedToWorktreeId).toBeUndefined()
  })

  it('migrates default (no inheritWorktree) + no sessionId → inherit, unlocked', () => {
    const store = baseStore({
      tasks: [
        {
          id: 't1',
          description: 'test',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1'
        }
      ]
    })
    runMigrations(store)
    const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
    expect(tasks[0].worktreeMode).toBe('inherit')
    expect(tasks[0].worktreeLocked).toBe(false)
  })

  it('removes inheritWorktree field from all tasks', () => {
    const store = baseStore({
      tasks: [
        {
          id: 't1',
          description: 'a',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1',
          inheritWorktree: true
        },
        {
          id: 't2',
          description: 'b',
          state: 'idle',
          children: [],
          createdAt: '2025-01-01',
          groupId: 'g1',
          inheritWorktree: false
        }
      ]
    })
    runMigrations(store)
    const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
    for (const t of tasks) {
      expect(t).not.toHaveProperty('inheritWorktree')
    }
  })

  it('removes worktreesEnabled field from settings', () => {
    const store = baseStore()
    runMigrations(store)
    const settings = store.get('settings') as Record<string, unknown>
    expect(settings).not.toHaveProperty('worktreesEnabled')
  })
})
