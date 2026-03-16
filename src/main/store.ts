import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import simpleGit from 'simple-git'
import { existsSync } from 'fs'
import { isAbsolute } from 'path'
import type { Task, TaskGroup } from '../shared/types'
import {
  TasksArraySchema,
  GroupsArraySchema,
  ActiveGroupIdSchema,
  SidebarWidthSchema,
  RootTaskOrderSchema,
  DirPathSchema,
  BranchNameSchema
} from './validation'
import { IPC } from '../shared/channels'

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
  ipcMain.handle(IPC.STORE_GET_TASKS, (): Task[] => {
    return store.get('tasks')
  })

  ipcMain.handle(IPC.STORE_SAVE_TASKS, (_event, tasks: unknown): void => {
    store.set('tasks', TasksArraySchema.parse(tasks) as Task[])
  })

  ipcMain.handle(IPC.STORE_GET_GROUPS, (): TaskGroup[] => {
    return store.get('groups')
  })

  ipcMain.handle(IPC.STORE_SAVE_GROUPS, (_event, groups: unknown): void => {
    store.set('groups', GroupsArraySchema.parse(groups) as TaskGroup[])
  })

  ipcMain.handle(IPC.STORE_GET_ACTIVE_GROUP_ID, (): string => {
    return store.get('activeGroupId')
  })

  ipcMain.handle(IPC.STORE_SAVE_ACTIVE_GROUP_ID, (_event, id: unknown): void => {
    store.set('activeGroupId', ActiveGroupIdSchema.parse(id))
  })

  ipcMain.handle(IPC.STORE_GET_SIDEBAR_WIDTH, (): number => {
    return store.get('sidebarWidth')
  })

  ipcMain.handle(IPC.STORE_SAVE_SIDEBAR_WIDTH, (_event, width: unknown): void => {
    store.set('sidebarWidth', SidebarWidthSchema.parse(width))
  })

  ipcMain.handle(IPC.STORE_GET_ROOT_TASK_ORDER, (): Record<string, string[]> => {
    return store.get('rootTaskOrder')
  })

  ipcMain.handle(IPC.STORE_SAVE_ROOT_TASK_ORDER, (_event, order: unknown): void => {
    store.set('rootTaskOrder', RootTaskOrderSchema.parse(order))
  })

  ipcMain.handle(IPC.DIALOG_OPEN_DIRECTORY, async (event): Promise<string | undefined> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC.GIT_VALIDATE_REPO,
    async (_event, dirPath: unknown): Promise<{ valid: boolean; error?: string }> => {
      const dir = DirPathSchema.parse(dirPath)
      if (!isAbsolute(dir)) return { valid: false, error: 'Path must be absolute' }
      if (!existsSync(dir)) {
        return { valid: false, error: 'Path does not exist' }
      }
      try {
        const git = simpleGit(dir)
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
    IPC.GIT_DETECT_BRANCH,
    async (
      _event,
      dirPath: unknown
    ): Promise<{ current: string; mainBranch: string | null; error?: string }> => {
      const dir = DirPathSchema.parse(dirPath)
      try {
        const git = simpleGit(dir)
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
    IPC.GIT_DIFF_UNCOMMITTED,
    async (_event, dirPath: unknown): Promise<{ diff: string; error?: string }> => {
      const dir = DirPathSchema.parse(dirPath)
      try {
        const git = simpleGit(dir)
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
    IPC.GIT_DIFF_BRANCH,
    async (
      _event,
      dirPath: unknown,
      mainBranch: unknown
    ): Promise<{ diff: string; error?: string }> => {
      const dir = DirPathSchema.parse(dirPath)
      const branch = BranchNameSchema.parse(mainBranch)
      try {
        const git = simpleGit(dir)
        // Use merge-base so only changes on the current branch are shown,
        // not changes made on the main branch after the branch point
        const mergeBase = (await git.raw(['merge-base', branch, 'HEAD'])).trim()
        const diff = await git.diff([mergeBase])
        return { diff }
      } catch {
        return { diff: '', error: 'Failed to get branch diff' }
      }
    }
  )
}
