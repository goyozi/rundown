import type { Task, TaskGroup } from '../shared/types'

export interface StoreAccess {
  get(key: 'tasks'): Task[]
  get(key: 'groups'): TaskGroup[]
  get(key: 'rootTaskOrder'): Record<string, string[]>
  get(key: 'schemaVersion'): number
  get(key: string): unknown
  set(key: string, value: unknown): void
}

interface Migration {
  version: number
  up: (store: StoreAccess) => void
}

const DEFAULT_GROUP_ID = '00000000-0000-0000-0000-000000000000'

const migrations: Migration[] = [
  {
    version: 1,
    up: (store) => {
      const groups = store.get('groups') as TaskGroup[]
      const tasks = store.get('tasks') as Task[]

      if ((!groups || groups.length === 0) && tasks.length > 0) {
        const defaultGroup: TaskGroup = {
          id: DEFAULT_GROUP_ID,
          name: 'Rundown',
          createdAt: new Date().toISOString()
        }
        store.set('groups', [defaultGroup])
        store.set('activeGroupId', DEFAULT_GROUP_ID)
        store.set(
          'tasks',
          tasks.map((t) => ({ ...t, groupId: DEFAULT_GROUP_ID }))
        )
      } else if (groups && groups.length > 0 && tasks.some((t) => !t.groupId)) {
        const firstGroupId = groups[0].id
        store.set(
          'tasks',
          tasks.map((t) => (t.groupId ? t : { ...t, groupId: firstGroupId }))
        )
      }
    }
  },
  {
    version: 2,
    up: (store) => {
      const rootTaskOrder = store.get('rootTaskOrder') as Record<string, string[]>
      const tasks = store.get('tasks') as Task[]
      const groups = store.get('groups') as TaskGroup[]

      if (Object.keys(rootTaskOrder).length === 0 && tasks.length > 0) {
        const order: Record<string, string[]> = {}
        for (const group of groups) {
          order[group.id] = tasks
            .filter((t) => !t.parentId && t.groupId === group.id)
            .map((t) => t.id)
        }
        store.set('rootTaskOrder', order)
      }
    }
  },
  {
    version: 3,
    up: (store) => {
      const comments = store.get('comments')
      if (!comments) {
        store.set('comments', {})
      }
    }
  },
  {
    version: 4,
    up: (store) => {
      const settings = store.get('settings')
      if (!settings) {
        store.set('settings', {
          theme: 'system',
          worktreesEnabled: false,
          worktreeBaseDir: '~/.rundown/worktrees/'
        })
      }
    }
  },
  {
    version: 5,
    up: (store) => {
      const settings = store.get('settings') as Record<string, unknown> | undefined
      if (settings && settings.sessionResume === undefined) {
        store.set('settings', { ...settings, sessionResume: false })
      }
    }
  },
  {
    version: 6,
    up: (store) => {
      // Migrate settings: worktreesEnabled → defaultWorktreeMode
      const settings = store.get('settings') as Record<string, unknown> | undefined
      if (settings) {
        const wasEnabled = settings.worktreesEnabled
        const newSettings = { ...settings }
        delete newSettings.worktreesEnabled
        newSettings.defaultWorktreeMode = wasEnabled ? 'own-worktree' : 'no-worktree'
        store.set('settings', newSettings)
      }

      // Migrate tasks: inheritWorktree → worktreeMode + worktreeLocked
      const tasks = store.get('tasks') as unknown as Record<string, unknown>[]
      if (tasks && tasks.length > 0) {
        const migrated = tasks.map((t) => {
          const task = { ...t }
          const hadInheritFalse = task.inheritWorktree === false
          const hasWorktree = !!task.worktree
          const hasSessionId = !!task.sessionId

          const worktreeId = hasWorktree
            ? (task.worktree as Record<string, unknown>).worktreeId
            : undefined

          if (hadInheritFalse && hasWorktree) {
            task.worktreeMode = 'own-worktree'
            task.worktreeLocked = true
            task.lockedToWorktreeId = worktreeId
          } else if (hadInheritFalse && !hasWorktree) {
            task.worktreeMode = 'own-worktree'
            task.worktreeLocked = false
          } else if (hasSessionId) {
            task.worktreeMode = 'inherit'
            task.worktreeLocked = true
            // Inheriting tasks in v1 didn't track which worktree they used;
            // lockedToWorktreeId stays undefined — health check on next resume will handle it
          } else {
            task.worktreeMode = 'inherit'
            task.worktreeLocked = false
          }

          delete task.inheritWorktree
          return task
        })
        store.set('tasks', migrated)
      }
    }
  }
]

export function runMigrations(store: StoreAccess): void {
  const currentVersion = (store.get('schemaVersion') as number | undefined) ?? 0

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      try {
        migration.up(store)
        store.set('schemaVersion', migration.version)
      } catch (err) {
        // Log and stop — partial migration is safer than crashing on startup.
        // The app will still load with whatever schema version we reached.
        console.error(`Migration v${migration.version} failed:`, err)
        break
      }
    }
  }
}
