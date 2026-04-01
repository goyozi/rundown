export interface WorktreeRecord {
  worktreeId: string
  name: string // "brave-falcon-a3f2"
  path: string // absolute path to worktree dir
  branchName: string // "worktree/brave-falcon-a3f2"
  repoPath: string // parent git repo path
  createdAt: string
}

export type WorktreeMode = 'inherit' | 'own-worktree' | 'no-worktree'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  defaultWorktreeMode: 'own-worktree' | 'no-worktree'
  worktreeBaseDir: string // default "~/.rundown/worktrees/"
  sessionResume: boolean
}

export interface Task {
  id: string
  description: string
  directory?: string
  state: 'idle' | 'done'
  parentId?: string
  children: string[]
  createdAt: string
  groupId: string
  worktreeMode?: WorktreeMode // default 'inherit' when absent
  worktreeLocked?: boolean // default false when absent
  lockedToWorktreeId?: string // worktreeId this task is locked to (own or inherited)
  worktree?: WorktreeRecord // only on tasks that OWN a worktree
  sessionId?: string
}

export interface TaskGroup {
  id: string
  name: string
  directory?: string
  createdAt: string
}

export type DiffMode = 'uncommitted' | 'branch'

export interface Comment {
  id: string
  filePath: string
  changeKey: string // react-diff-view change key (e.g. "I5", "D3", "N10")
  lineNumber: number
  body: string
}

export interface Shortcut {
  id: string
  name: string
  icon: string
  type: 'shell' | 'claude'
  command: string
  order: number
}
