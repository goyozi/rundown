import { ElectronAPI } from '@electron-toolkit/preload'
import type { Task } from '../shared/types'

interface RundownAPI {
  getTasks(): Promise<Task[]>
  saveTasks(tasks: Task[]): Promise<void>
  openDirectory(): Promise<string | undefined>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RundownAPI
  }
}
