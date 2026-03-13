import { useEffect, useCallback, type RefObject } from 'react'
import { useTaskStore } from '@/store/task-store'

export function useTaskKeyboardNav(containerRef: RefObject<HTMLDivElement | null>): void {
  const getVisibleTaskIds = useCallback((): string[] => {
    if (!containerRef.current) return []
    const els = containerRef.current.querySelectorAll<HTMLElement>('[data-task-id]')
    return Array.from(els).map((el) => el.dataset.taskId!)
  }, [containerRef])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      if (target.closest('.xterm')) return
      if (document.querySelector('[role="dialog"]')) return

      const store = useTaskStore.getState()
      const { selectedTaskId, selectTask } = store

      const visibleIds = getVisibleTaskIds()
      if (visibleIds.length === 0) return

      const currentIndex = selectedTaskId ? visibleIds.indexOf(selectedTaskId) : -1

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            if (!selectedTaskId) return
            const task = store.getTask(selectedTaskId)
            if (!task) return
            const siblings = task.parentId ? store.getChildren(task.parentId) : store.getRootTasks()
            const idx = siblings.findIndex((s) => s.id === selectedTaskId)
            if (idx < siblings.length - 1) {
              store.moveTask(selectedTaskId, task.parentId, idx + 1)
            }
          } else {
            if (currentIndex < visibleIds.length - 1) {
              selectTask(visibleIds[currentIndex + 1])
            } else if (currentIndex === -1 && visibleIds.length > 0) {
              selectTask(visibleIds[0])
            }
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            if (!selectedTaskId) return
            const task = store.getTask(selectedTaskId)
            if (!task) return
            const siblings = task.parentId ? store.getChildren(task.parentId) : store.getRootTasks()
            const idx = siblings.findIndex((s) => s.id === selectedTaskId)
            if (idx > 0) {
              store.moveTask(selectedTaskId, task.parentId, idx - 1)
            }
          } else {
            if (currentIndex > 0) {
              selectTask(visibleIds[currentIndex - 1])
            } else if (currentIndex === -1 && visibleIds.length > 0) {
              selectTask(visibleIds[visibleIds.length - 1])
            }
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (!selectedTaskId) return
          const taskEl = containerRef.current?.querySelector(`[data-task-id="${selectedTaskId}"]`)
          const editBtn = taskEl?.querySelector('[data-testid="edit-task"]') as HTMLElement | null
          editBtn?.click()
          break
        }
        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          if (!selectedTaskId) return
          const nextFocus =
            currentIndex < visibleIds.length - 1
              ? visibleIds[currentIndex + 1]
              : currentIndex > 0
                ? visibleIds[currentIndex - 1]
                : null
          store.deleteTask(selectedTaskId)
          selectTask(nextFocus)
          break
        }
        case ' ': {
          e.preventDefault()
          if (!selectedTaskId) return
          const task = store.getTask(selectedTaskId)
          if (!task) return
          if (task.state === 'done') {
            store.markIdle(selectedTaskId)
          } else if (!store.activeSessions.has(selectedTaskId)) {
            store.markDone(selectedTaskId)
          }
          break
        }
        case 'Tab': {
          e.preventDefault()
          if (!selectedTaskId) return
          const task = store.getTask(selectedTaskId)
          if (!task) return

          if (e.shiftKey) {
            if (!task.parentId) return
            const parent = store.getTask(task.parentId)
            if (!parent) return
            const parentSiblings = parent.parentId
              ? store.getChildren(parent.parentId)
              : store.getRootTasks()
            const parentIdx = parentSiblings.findIndex((s) => s.id === parent.id)
            store.moveTask(selectedTaskId, parent.parentId, parentIdx + 1)
          } else {
            const siblings = task.parentId ? store.getChildren(task.parentId) : store.getRootTasks()
            const idx = siblings.findIndex((s) => s.id === selectedTaskId)
            if (idx <= 0) return
            const prevSibling = siblings[idx - 1]
            const prevDepth = store.getDepth(prevSibling.id)
            const subtreeDepth = store.getMaxSubtreeDepth(selectedTaskId)
            if (prevDepth + 1 + subtreeDepth > 4) return
            const prevChildren = store.getChildren(prevSibling.id)
            store.moveTask(selectedTaskId, prevSibling.id, prevChildren.length)
          }
          break
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [getVisibleTaskIds, containerRef])
}
