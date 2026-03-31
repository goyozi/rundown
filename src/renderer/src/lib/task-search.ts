import type { Task, TaskGroup } from '../../../shared/types'

export interface SearchableTask {
  id: string
  groupId: string
  breadcrumb: string // "Group > Parent > Task"
  description: string
  state: Task['state']
}

export interface SearchResult {
  task: SearchableTask
  /** Indices into `breadcrumb` that matched, used for highlighting */
  matchedIndices: number[]
}

/**
 * Build a flat list of searchable tasks from the store state.
 * Each task gets a breadcrumb like "GroupName > ParentTask > ChildTask".
 */
export function buildSearchableList(tasks: Task[], groups: TaskGroup[]): SearchableTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const groupMap = new Map(groups.map((g) => [g.id, g]))

  return tasks.map((task) => {
    const parts: string[] = []

    // Build ancestor chain (child → root)
    let current: Task | undefined = task
    while (current) {
      parts.unshift(current.description)
      current = current.parentId ? taskMap.get(current.parentId) : undefined
    }

    // Prepend group name
    const group = groupMap.get(task.groupId)
    if (group) parts.unshift(group.name)

    return {
      id: task.id,
      groupId: task.groupId,
      breadcrumb: parts.join(' > '),
      description: task.description,
      state: task.state
    }
  })
}

/**
 * Multi-token partial-word search.
 * Each space-separated token must match somewhere in the breadcrumb (case-insensitive).
 * Returns matched results with character indices for highlighting.
 */
export function searchTasks(
  query: string,
  items: SearchableTask[],
  limit: number = 8
): SearchResult[] {
  const raw = query.trim()
  if (!raw) return items.slice(0, limit).map((task) => ({ task, matchedIndices: [] }))

  const tokens = raw.toLowerCase().split(/\s+/)

  const results: SearchResult[] = []

  for (const item of items) {
    const lower = item.breadcrumb.toLowerCase()

    // Check that every token matches somewhere
    let allMatch = true
    const matchedIndices: number[] = []
    const used = new Set<number>() // prevent double-matching same char

    for (const token of tokens) {
      let pos = 0
      let found = false
      // Find the first occurrence that doesn't overlap with already-matched chars
      while (pos <= lower.length - token.length) {
        const idx = lower.indexOf(token, pos)
        if (idx === -1) break
        // Check no overlap
        const indices = Array.from({ length: token.length }, (_, i) => idx + i)
        if (indices.every((i) => !used.has(i))) {
          indices.forEach((i) => {
            matchedIndices.push(i)
            used.add(i)
          })
          found = true
          break
        }
        pos = idx + 1
      }
      if (!found) {
        allMatch = false
        break
      }
    }

    if (allMatch) {
      matchedIndices.sort((a, b) => a - b)
      results.push({ task: item, matchedIndices })
    }
  }

  // Sort: tasks whose description starts with a matched token first,
  // then by breadcrumb length (shorter = higher). Tie-break alphabetical.
  results.sort((a, b) => {
    const aDescLower = a.task.description.toLowerCase()
    const bDescLower = b.task.description.toLowerCase()
    const aStarts = tokens.some((t) => aDescLower.startsWith(t)) ? 0 : 1
    const bStarts = tokens.some((t) => bDescLower.startsWith(t)) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    if (a.task.breadcrumb.length !== b.task.breadcrumb.length) {
      return a.task.breadcrumb.length - b.task.breadcrumb.length
    }
    return a.task.breadcrumb.localeCompare(b.task.breadcrumb)
  })

  return results.slice(0, limit)
}
