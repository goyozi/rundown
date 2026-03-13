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
  createdAt: string
}
