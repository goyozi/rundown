import type { Task } from '../../../shared/types'

/**
 * Recursively collects the given task ID and all descendant IDs (DFS, parent-first).
 * The `getTask` lookup is injected so this works with both store state and component props.
 */
export function collectTaskIds(
  taskId: string,
  getTask: (id: string) => Task | undefined
): string[] {
  const task = getTask(taskId)
  if (!task) return []
  const childIds = task.children.flatMap((cid) => collectTaskIds(cid, getTask))
  return [taskId, ...childIds]
}

/**
 * Normalize a directory path for safe comparison: strip trailing slashes.
 * Handles the common mismatch where one path has a trailing slash and the other doesn't.
 */
export function normalizeDirPath(p: string | undefined): string | undefined {
  if (!p) return p
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}
