import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Task, TaskGroup, Comment } from '../shared/types'
import { IPC } from '../shared/channels'

const api = {
  getTasks: () => ipcRenderer.invoke(IPC.STORE_GET_TASKS),
  saveTasks: (tasks: Task[]) => ipcRenderer.invoke(IPC.STORE_SAVE_TASKS, tasks),
  getGroups: () => ipcRenderer.invoke(IPC.STORE_GET_GROUPS),
  saveGroups: (groups: TaskGroup[]) => ipcRenderer.invoke(IPC.STORE_SAVE_GROUPS, groups),
  getActiveGroupId: () => ipcRenderer.invoke(IPC.STORE_GET_ACTIVE_GROUP_ID),
  saveActiveGroupId: (id: string) => ipcRenderer.invoke(IPC.STORE_SAVE_ACTIVE_GROUP_ID, id),
  getSidebarWidth: () => ipcRenderer.invoke(IPC.STORE_GET_SIDEBAR_WIDTH),
  saveSidebarWidth: (width: number) => ipcRenderer.invoke(IPC.STORE_SAVE_SIDEBAR_WIDTH, width),
  getRootTaskOrder: () => ipcRenderer.invoke(IPC.STORE_GET_ROOT_TASK_ORDER),
  saveRootTaskOrder: (order: Record<string, string[]>) =>
    ipcRenderer.invoke(IPC.STORE_SAVE_ROOT_TASK_ORDER, order),
  getComments: () => ipcRenderer.invoke(IPC.STORE_GET_COMMENTS),
  saveComments: (comments: Record<string, Comment[]>) =>
    ipcRenderer.invoke(IPC.STORE_SAVE_COMMENTS, comments),
  logError: (message: string, stack?: string) =>
    ipcRenderer.send(IPC.RENDERER_LOG_ERROR, message, stack),
  openDirectory: () => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIRECTORY),
  validateRepo: (dirPath: string) => ipcRenderer.invoke(IPC.GIT_VALIDATE_REPO, dirPath),
  detectBranch: (dirPath: string) => ipcRenderer.invoke(IPC.GIT_DETECT_BRANCH, dirPath),
  diffUncommitted: (dirPath: string) => ipcRenderer.invoke(IPC.GIT_DIFF_UNCOMMITTED, dirPath),
  diffBranch: (dirPath: string, mainBranch: string) =>
    ipcRenderer.invoke(IPC.GIT_DIFF_BRANCH, dirPath, mainBranch),

  // Theme
  setNativeTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke(IPC.THEME_SET, theme),

  // PTY
  ptySpawn: (taskId: string, cwd: string, theme: 'light' | 'dark' = 'dark') =>
    ipcRenderer.invoke(IPC.PTY_SPAWN, taskId, cwd, theme),
  ptySpawnShell: (sessionId: string, cwd: string, theme: 'light' | 'dark' = 'dark') =>
    ipcRenderer.invoke(IPC.PTY_SPAWN_SHELL, sessionId, cwd, theme),
  ptyWrite: (taskId: string, data: string) => ipcRenderer.invoke(IPC.PTY_WRITE, taskId, data),
  ptyResize: (taskId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.PTY_RESIZE, taskId, cols, rows),
  ptyKill: (taskId: string) => ipcRenderer.invoke(IPC.PTY_KILL, taskId),
  onPtyData: (callback: (taskId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, taskId: string, data: string): void =>
      callback(taskId, data)
    ipcRenderer.on(IPC.PTY_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_DATA, handler)
  },
  onPtyExit: (callback: (taskId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, taskId: string): void => callback(taskId)
    ipcRenderer.on(IPC.PTY_EXIT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_EXIT, handler)
  }
}

if (!process.contextIsolated) {
  throw new Error('Context isolation is required but was not enabled')
}

try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
