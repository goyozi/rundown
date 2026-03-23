import { useEffect } from 'react'
import { useTaskStore } from '@/store/task-store'
import type { DetailTab } from '@/store/slices/shell-tab-slice'

/**
 * Global keyboard shortcuts for navigating between panes and tabs.
 * Registered in capture phase so it works even when focus is inside xterm.
 *
 * - Cmd+T              — focus task pane (blur right pane)
 * - Cmd+Up / Cmd+K     — select previous task (from anywhere)
 * - Cmd+Down / Cmd+J   — select next task (from anywhere)
 * - Cmd+1..9           — switch to the Nth tab in the right pane
 */
export function usePaneKeyboardNav(): void {
  useEffect(() => {
    const getVisibleTaskIds = (): string[] => {
      const els = document.querySelectorAll<HTMLElement>('[data-task-id]')
      return Array.from(els).map((el) => el.dataset.taskId!)
    }

    const handler = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey) return
      if (document.querySelector('[role="dialog"]')) return

      const store = useTaskStore.getState()
      const { selectedTaskId, selectTask } = store

      // Cmd+T: focus task pane
      if (e.key === 't' && !e.shiftKey) {
        e.preventDefault()
        ;(document.activeElement as HTMLElement)?.blur()
        return
      }

      // Cmd+Up/Down/J/K (no shift): navigate tasks from anywhere
      if (!e.shiftKey && (e.key === 'ArrowDown' || e.key === 'j')) {
        e.preventDefault()
        const ids = getVisibleTaskIds()
        if (ids.length === 0) return
        const idx = selectedTaskId ? ids.indexOf(selectedTaskId) : -1
        if (idx < ids.length - 1) {
          selectTask(ids[idx + 1])
        } else if (idx === -1) {
          selectTask(ids[0])
        }
        return
      }

      if (!e.shiftKey && (e.key === 'ArrowUp' || e.key === 'k')) {
        e.preventDefault()
        const ids = getVisibleTaskIds()
        if (ids.length === 0) return
        const idx = selectedTaskId ? ids.indexOf(selectedTaskId) : -1
        if (idx > 0) {
          selectTask(ids[idx - 1])
        } else if (idx === -1) {
          selectTask(ids[ids.length - 1])
        }
        return
      }

      if (e.shiftKey) return

      if (!selectedTaskId) return

      // Cmd+1..9: switch to Nth tab
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 9) {
        const tabs = buildTabList(store, selectedTaskId)
        const idx = num - 1
        if (idx >= tabs.length) return
        e.preventDefault()
        store.setActiveTab(selectedTaskId, tabs[idx])
        // Focus the terminal after React re-renders
        requestAnimationFrame(() => focusActiveTerminal(useTaskStore.getState()))
      }
    }

    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])
}

function buildTabList(
  store: ReturnType<typeof useTaskStore.getState>,
  taskId: string
): DetailTab[] {
  const tabs: DetailTab[] = ['claude']
  const effectiveDir = store.getEffectiveDirectory(taskId)
  if (effectiveDir) tabs.push('review')
  const shellTabs = store.shellTabsPerTask[taskId] || []
  for (const st of shellTabs) {
    tabs.push(`shell:${st.id}`)
  }
  return tabs
}

function focusActiveTerminal(store: ReturnType<typeof useTaskStore.getState>): void {
  const { selectedTaskId } = store
  if (!selectedTaskId) return

  const activeTab = store.tabPerTask[selectedTaskId] || 'claude'

  // Determine which session ID corresponds to the active tab
  let sessionId: string | undefined
  if (activeTab === 'claude' && store.activeSessions.has(selectedTaskId)) {
    sessionId = selectedTaskId
  } else if (activeTab.startsWith('shell:')) {
    const shellId = activeTab.slice('shell:'.length)
    const shellTabs = store.shellTabsPerTask[selectedTaskId] || []
    const shellTab = shellTabs.find((st) => st.id === shellId)
    if (shellTab) sessionId = shellTab.sessionId
  }

  if (!sessionId) return

  // Find the terminal panel by session ID and focus its xterm textarea
  requestAnimationFrame(() => {
    const panel = document.querySelector(`[data-session-id="${sessionId}"]`)
    const textarea = panel?.querySelector('.xterm-helper-textarea') as HTMLElement | null
    textarea?.focus()
  })
}
