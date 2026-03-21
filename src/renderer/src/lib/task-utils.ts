import type { Task, WorktreeMode } from '../../../shared/types'

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

/**
 * Decision returned by the visitor at each ancestor during a worktree mode walk.
 * - `'stop'`: this ancestor provides a concrete decision (worktree or no-worktree), end walk.
 * - `'transparent'`: this ancestor has intent-only own-worktree — skip and keep walking.
 * - `'inherit'`: this ancestor is set to inherit — keep walking.
 */
export type WalkDecision = 'stop' | 'transparent' | 'inherit'

/**
 * Generic walker that traverses up the task tree from `startId`, calling `visit`
 * at each node. The visitor controls the walk via `WalkDecision`:
 * - `'stop'`  — end the walk and return the associated result.
 * - `'transparent'` / `'inherit'` — skip this node and continue to the parent.
 *
 * Callers pair this with `classifyWorktreeMode` to encode the spec's transparency
 * rules (unlocked intent-only ancestors are skipped).
 *
 * @param startId  Task ID to start the walk from.
 * @param tasks    Full task list.
 * @param visit    Called for each task in the walk. Receives the task and whether it's the
 *                 starting task (`isFirst`). Return a `WalkDecision` to control the walk,
 *                 and optionally a result value `R` that `walkWorktreeAncestors` will return.
 * @returns The result from the first `visit` that returns `'stop'`, or `undefined` if the
 *          walk reaches the root without stopping.
 */
export function walkWorktreeAncestors<R>(
  startId: string,
  tasks: Task[],
  visit: (task: Task, isFirst: boolean) => { decision: WalkDecision; result?: R }
): R | undefined {
  let current = tasks.find((t) => t.id === startId)
  let isFirst = true
  while (current) {
    const { decision, result } = visit(current, isFirst)
    if (decision === 'stop') return result
    // 'transparent' or 'inherit' — keep walking
    if (!current.parentId) return undefined
    current = tasks.find((t) => t.id === current!.parentId)
    isFirst = false
  }
  return undefined
}

/**
 * Classifies a task's worktree mode during an ancestor walk.
 * Encodes the transparency rule so callers don't need to duplicate it.
 *
 * An ancestor is **transparent** (skipped during inheritance) when it has an
 * explicit mode set but is not yet locked/concrete:
 * - `own-worktree` without a created worktree on disk
 * - `no-worktree` without being locked
 *
 * This unified rule means unlocked = intent-only for both modes.
 */
export function classifyWorktreeMode(
  task: Task,
  isFirst: boolean
): { mode: WorktreeMode; isConcrete: boolean; isTransparent: boolean } {
  const mode = task.worktreeMode ?? 'inherit'
  const hasConcrete = !!task.worktree
  const isOwnWorktreeTransparent = mode === 'own-worktree' && !hasConcrete && !isFirst
  const isNoWorktreeTransparent = mode === 'no-worktree' && !task.worktreeLocked && !isFirst
  return {
    mode,
    isConcrete: hasConcrete,
    isTransparent: isOwnWorktreeTransparent || isNoWorktreeTransparent
  }
}
