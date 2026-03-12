import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getTasks: () => ipcRenderer.invoke('store:get-tasks'),
  saveTasks: (tasks: unknown[]) => ipcRenderer.invoke('store:save-tasks', tasks),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  validateRepo: (dirPath: string) => ipcRenderer.invoke('git:validate-repo', dirPath),
  detectBranch: (dirPath: string) => ipcRenderer.invoke('git:detect-branch', dirPath),
  diffUncommitted: (dirPath: string) => ipcRenderer.invoke('git:diff-uncommitted', dirPath),
  diffBranch: (dirPath: string, mainBranch: string) =>
    ipcRenderer.invoke('git:diff-branch', dirPath, mainBranch),

  // Theme
  setNativeTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('theme:set', theme),

  // PTY
  ptySpawn: (taskId: string, cwd: string) => ipcRenderer.invoke('pty:spawn', taskId, cwd),
  ptyWrite: (taskId: string, data: string) => ipcRenderer.invoke('pty:write', taskId, data),
  ptyResize: (taskId: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty:resize', taskId, cols, rows),
  ptyKill: (taskId: string) => ipcRenderer.invoke('pty:kill', taskId),
  onPtyData: (callback: (taskId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, taskId: string, data: string): void =>
      callback(taskId, data)
    ipcRenderer.on('pty:data', handler)
    return () => ipcRenderer.removeListener('pty:data', handler)
  },
  onPtyExit: (callback: (taskId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, taskId: string): void => callback(taskId)
    ipcRenderer.on('pty:exit', handler)
    return () => ipcRenderer.removeListener('pty:exit', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
