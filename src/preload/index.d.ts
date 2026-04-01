import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  Task,
  TaskGroup,
  Comment,
  AppSettings,
  WorktreeRecord,
  Shortcut
} from '../shared/types'

interface RundownAPI {
  getTasks(): Promise<Task[]>
  saveTasks(tasks: Task[]): Promise<void>
  getGroups(): Promise<TaskGroup[]>
  saveGroups(groups: TaskGroup[]): Promise<void>
  getActiveGroupId(): Promise<string>
  saveActiveGroupId(id: string): Promise<void>
  getSidebarWidth(): Promise<number>
  saveSidebarWidth(width: number): Promise<void>
  getRootTaskOrder(): Promise<Record<string, string[]>>
  saveRootTaskOrder(order: Record<string, string[]>): Promise<void>
  getShortcuts(): Promise<Shortcut[]>
  saveShortcuts(shortcuts: Shortcut[]): Promise<void>
  getComments(): Promise<Record<string, Comment[]>>
  saveComments(comments: Record<string, Comment[]>): Promise<void>
  logError(message: string, stack?: string): void
  openDirectory(): Promise<string | undefined>

  // Settings
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  setSessionResume(enabled: boolean): Promise<void>

  // Worktree
  worktreeCreate(repoPath: string, baseDir: string, taskId: string): Promise<WorktreeRecord>
  worktreeEnsureHealthy(
    worktree: WorktreeRecord
  ): Promise<{ healthy: boolean; issues: string[]; repaired?: WorktreeRecord }>
  worktreeCleanup(worktree: WorktreeRecord): Promise<void>
  validateRepo(dirPath: string): Promise<{ valid: boolean; error?: string }>
  detectBranch(
    dirPath: string
  ): Promise<{ current: string; mainBranch: string | null; error?: string }>
  diffUncommitted(dirPath: string): Promise<{ diff: string; error?: string }>
  diffBranch(dirPath: string, mainBranch: string): Promise<{ diff: string; error?: string }>

  // Shell
  openExternal(url: string): Promise<void>

  // Theme
  setNativeTheme(theme: 'light' | 'dark' | 'system'): Promise<void>

  // PTY
  ptySpawn(
    taskId: string,
    cwd: string,
    theme?: 'light' | 'dark'
  ): Promise<{ success: boolean; error?: string }>
  ptySpawnShell(
    sessionId: string,
    cwd: string,
    theme?: 'light' | 'dark'
  ): Promise<{ success: boolean; error?: string }>
  ptyWrite(taskId: string, data: string): Promise<void>
  ptyResize(taskId: string, cols: number, rows: number): Promise<void>
  ptyKill(taskId: string): Promise<void>
  ptySnapshot(sessionId: string): Promise<string>
  onPtyData(callback: (taskId: string, data: string) => void): () => void
  onPtyExit(callback: (taskId: string) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RundownAPI
  }
}
