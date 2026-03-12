export interface Task {
  id: string
  description: string
  directory?: string
  state: 'idle' | 'done'
  parentId?: string
  children: string[]
  createdAt: string
}
