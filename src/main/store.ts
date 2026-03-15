import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import simpleGit from 'simple-git'
import { existsSync } from 'fs'
import type { Task, TaskGroup } from '../shared/types'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

interface StoreSchema {
  tasks: Task[]
  groups: TaskGroup[]
  activeGroupId: string
  windowState: WindowState
  sidebarWidth: number
  rootTaskOrder: Record<string, string[]>
}

const DEFAULT_GROUP_ID = '00000000-0000-0000-0000-000000000000'

const storeOptions: ConstructorParameters<typeof Store<StoreSchema>>[0] = {
  defaults: {
    tasks: [],
    groups: [{ id: DEFAULT_GROUP_ID, name: 'Rundown', createdAt: new Date().toISOString() }],
    activeGroupId: DEFAULT_GROUP_ID,
    windowState: {
      width: 900,
      height: 670,
      isMaximized: false
    },
    sidebarWidth: 320,
    rootTaskOrder: {}
  }
}

if (process.env.ELECTRON_STORE_PATH) {
  storeOptions.cwd = process.env.ELECTRON_STORE_PATH
}

const store = new Store<StoreSchema>(storeOptions)

// Migrate existing data: if groups are empty but tasks exist, create default group and assign tasks
function migrateIfNeeded(): void {
  const groups = store.get('groups')
  const tasks = store.get('tasks')

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
    // Some tasks missing groupId — assign to first group
    const firstGroupId = groups[0].id
    store.set(
      'tasks',
      tasks.map((t) => (t.groupId ? t : { ...t, groupId: firstGroupId }))
    )
  }
}

migrateIfNeeded()

// Migrate: build rootTaskOrder from existing tasks if missing
function migrateRootTaskOrder(): void {
  const rootTaskOrder = store.get('rootTaskOrder')
  const tasks = store.get('tasks')
  const groups = store.get('groups')

  if (Object.keys(rootTaskOrder).length === 0 && tasks.length > 0) {
    const order: Record<string, string[]> = {}
    for (const group of groups) {
      order[group.id] = tasks.filter((t) => !t.parentId && t.groupId === group.id).map((t) => t.id)
    }
    store.set('rootTaskOrder', order)
  }
}

migrateRootTaskOrder()

export function getWindowState(): WindowState {
  return store.get('windowState')
}

export function saveWindowState(state: WindowState): void {
  store.set('windowState', state)
}

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get-tasks', () => {
    return store.get('tasks')
  })

  ipcMain.handle('store:save-tasks', (_event, tasks: Task[]) => {
    store.set('tasks', tasks)
  })

  ipcMain.handle('store:get-groups', () => {
    return store.get('groups')
  })

  ipcMain.handle('store:save-groups', (_event, groups: TaskGroup[]) => {
    store.set('groups', groups)
  })

  ipcMain.handle('store:get-active-group-id', () => {
    return store.get('activeGroupId')
  })

  ipcMain.handle('store:save-active-group-id', (_event, id: string) => {
    store.set('activeGroupId', id)
  })

  ipcMain.handle('store:get-sidebar-width', () => {
    return store.get('sidebarWidth')
  })

  ipcMain.handle('store:save-sidebar-width', (_event, width: number) => {
    store.set('sidebarWidth', width)
  })

  ipcMain.handle('store:get-root-task-order', () => {
    return store.get('rootTaskOrder')
  })

  ipcMain.handle('store:save-root-task-order', (_event, order: Record<string, string[]>) => {
    store.set('rootTaskOrder', order)
  })

  ipcMain.handle('dialog:open-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  ipcMain.handle(
    'git:validate-repo',
    async (_event, dirPath: string): Promise<{ valid: boolean; error?: string }> => {
      if (!existsSync(dirPath)) {
        return { valid: false, error: 'Path does not exist' }
      }
      try {
        const git = simpleGit(dirPath)
        const isRepo = await git.checkIsRepo()
        if (!isRepo) {
          return { valid: false, error: 'Not a Git repository' }
        }
        return { valid: true }
      } catch {
        return { valid: false, error: 'Not a Git repository' }
      }
    }
  )

  ipcMain.handle(
    'git:detect-branch',
    async (
      _event,
      dirPath: string
    ): Promise<{ current: string; mainBranch: string | null; error?: string }> => {
      try {
        const git = simpleGit(dirPath)
        const branchSummary = await git.branch()
        const current = branchSummary.current

        // Auto-detect main vs master: prefer 'main' if both exist
        let mainBranch: string | null = null
        const allBranches = branchSummary.all
        if (allBranches.includes('main')) {
          mainBranch = 'main'
        } else if (allBranches.includes('master')) {
          mainBranch = 'master'
        }

        return { current, mainBranch }
      } catch {
        return { current: '', mainBranch: null, error: 'Failed to detect branch' }
      }
    }
  )

  ipcMain.handle(
    'git:diff-uncommitted',
    async (_event, dirPath: string): Promise<{ diff: string; error?: string }> => {
      try {
        const git = simpleGit(dirPath)
        // Show both staged and unstaged changes vs HEAD
        const trackedDiff = await git.diff(['HEAD'])

        // Include untracked files by staging them with --intent-to-add,
        // running diff, then unstaging them
        const statusResult = await git.status()
        const untrackedFiles = statusResult.not_added
        let untrackedDiff = ''
        if (untrackedFiles.length > 0) {
          await git.raw(['add', '--intent-to-add', '--', ...untrackedFiles])
          try {
            untrackedDiff = await git.diff(['--', ...untrackedFiles])
          } finally {
            await git.raw(['reset', '--', ...untrackedFiles])
          }
        }

        return { diff: trackedDiff + untrackedDiff }
      } catch {
        return { diff: '', error: 'Failed to get uncommitted diff' }
      }
    }
  )

  ipcMain.handle(
    'git:diff-branch',
    async (
      _event,
      dirPath: string,
      mainBranch: string
    ): Promise<{ diff: string; error?: string }> => {
      try {
        const git = simpleGit(dirPath)
        // Use merge-base so only changes on the current branch are shown,
        // not changes made on the main branch after the branch point
        const mergeBase = (await git.raw(['merge-base', mainBranch, 'HEAD'])).trim()
        const diff = await git.diff([mergeBase])
        return { diff }
      } catch {
        return { diff: '', error: 'Failed to get branch diff' }
      }
    }
  )
}
