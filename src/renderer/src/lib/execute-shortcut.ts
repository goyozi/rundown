import type { Shortcut } from '../../../shared/types'
import { useTaskStore } from '@/store/task-store'

const SESSION_START_DELAY_MS = 2000

/**
 * Resolve the working directory for a task, preferring its worktree path if available.
 */
function resolveDir(
  taskId: string,
  state: ReturnType<typeof useTaskStore.getState>
): string | undefined {
  const worktree = state.getEffectiveWorktree(taskId)
  if (worktree) return worktree.path
  return state.getEffectiveDirectory(taskId)
}

function resolveTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Execute a shortcut against the currently selected task.
 * Auto-starts session/shell if needed, waits for readiness, then writes the command.
 */
export async function executeShortcut(shortcut: Shortcut): Promise<void> {
  const state = useTaskStore.getState()
  const taskId = state.selectedTaskId
  if (!taskId) return

  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return

  if (shortcut.type === 'claude') {
    await executeClaude(taskId, shortcut.command, state)
  } else {
    await executeShell(taskId, shortcut.command, state)
  }
}

async function executeClaude(
  taskId: string,
  command: string,
  state: ReturnType<typeof useTaskStore.getState>
): Promise<void> {
  const hasSession = state.activeSessions.has(taskId)

  if (!hasSession) {
    const dir = resolveDir(taskId, state)
    if (!dir) return
    const result = await window.api.ptySpawn(taskId, dir, resolveTheme())
    if (!result.success) return
    state.startSession(taskId)
    await delay(SESSION_START_DELAY_MS)
  }

  state.setActiveTab(taskId, 'claude')
  await window.api.ptyWrite(taskId, command + '\r')
}

async function executeShell(
  taskId: string,
  command: string,
  state: ReturnType<typeof useTaskStore.getState>
): Promise<void> {
  const shellTabs = state.getShellTabs(taskId)
  let sessionId: string

  if (shellTabs.length === 0) {
    const id = `shell-auto-${crypto.randomUUID().slice(0, 8)}`
    sessionId = `${taskId}:${id}`
    const dir = resolveDir(taskId, state)
    if (!dir) return
    const result = await window.api.ptySpawnShell(sessionId, dir, resolveTheme())
    if (!result.success) return
    const tab = { id, label: 'Shell 1', sessionId }
    state.addShellTab(taskId, tab)
    state.setActiveTab(taskId, `shell:${id}`)
    await delay(SESSION_START_DELAY_MS)
  } else {
    const tab = shellTabs[0]
    sessionId = tab.sessionId
    state.setActiveTab(taskId, `shell:${tab.id}`)
  }

  await window.api.ptyWrite(sessionId, command + '\r')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
