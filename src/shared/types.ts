export interface Task {
  id: string
  description: string
  directory?: string
  state: 'idle' | 'done'
  parentId?: string
  children: string[]
  createdAt: string
  groupId: string
}

export interface TaskGroup {
  id: string
  name: string
  directory?: string
  createdAt: string
}

export interface Comment {
  id: string
  filePath: string
  changeKey: string // react-diff-view change key (e.g. "I5", "D3", "N10")
  lineNumber: number
  body: string
}
