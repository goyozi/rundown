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
  }
]

export function runMigrations(store: StoreAccess): void {
  const currentVersion = (store.get('schemaVersion') as number | undefined) ?? 0

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      migration.up(store)
      store.set('schemaVersion', migration.version)
    }
  }
}
