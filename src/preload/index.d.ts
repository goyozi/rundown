import { ElectronAPI } from '@electron-toolkit/preload'
import type { Task } from '../shared/types'

interface RundownAPI {
  getTasks(): Promise<Task[]>
  saveTasks(tasks: Task[]): Promise<void>
  openDirectory(): Promise<string | undefined>
  validateRepo(dirPath: string): Promise<{ valid: boolean; error?: string }>

  // PTY
  ptySpawn(taskId: string, cwd: string): Promise<{ success: boolean; error?: string }>
  ptyWrite(taskId: string, data: string): Promise<void>
  ptyResize(taskId: string, cols: number, rows: number): Promise<void>
  ptyKill(taskId: string): Promise<void>
  onPtyData(callback: (taskId: string, data: string) => void): () => void
  onPtyExit(callback: (taskId: string) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RundownAPI
  }
}
