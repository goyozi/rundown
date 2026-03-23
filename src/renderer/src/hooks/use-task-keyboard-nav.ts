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

      const moveDown = (): void => {
        if (currentIndex < visibleIds.length - 1) {
          selectTask(visibleIds[currentIndex + 1])
        } else if (currentIndex === -1 && visibleIds.length > 0) {
          selectTask(visibleIds[0])
        }
      }

      const moveUp = (): void => {
        if (currentIndex > 0) {
          selectTask(visibleIds[currentIndex - 1])
        } else if (currentIndex === 0) {
          selectTask(null)
          const input = document.querySelector<HTMLInputElement>('[data-action="new-task-input"]')
          input?.focus()
        } else if (currentIndex === -1 && visibleIds.length > 0) {
          selectTask(visibleIds[visibleIds.length - 1])
        }
      }

      const collapseSelected = (): void => {
        if (!selectedTaskId) return
        const children = store.getChildren(selectedTaskId)
        if (children.length > 0 && !store.collapsedTaskIds.has(selectedTaskId)) {
          store.toggleCollapsed(selectedTaskId)
        }
      }

      const expandSelected = (): void => {
        if (!selectedTaskId) return
        if (store.collapsedTaskIds.has(selectedTaskId)) {
          store.toggleCollapsed(selectedTaskId)
        }
      }

      // Cmd+Up/Down/J/K handled by usePaneKeyboardNav (capture phase)
      if (e.metaKey || e.ctrlKey) {
        // Cmd+Shift+Down/J: move task down in order
        if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'J' || e.key === 'j')) {
          e.preventDefault()
          if (!selectedTaskId) return
          const task = store.getTask(selectedTaskId)
          if (!task) return
          const siblings = task.parentId ? store.getChildren(task.parentId) : store.getRootTasks()
          const idx = siblings.findIndex((s) => s.id === selectedTaskId)
          if (idx < siblings.length - 1) {
            store.moveTask(selectedTaskId, task.parentId, idx + 1)
          }
          return
        }
        // Cmd+Shift+Up/K: move task up in order
        if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'K' || e.key === 'k')) {
          e.preventDefault()
          if (!selectedTaskId) return
          const task = store.getTask(selectedTaskId)
          if (!task) return
          const siblings = task.parentId ? store.getChildren(task.parentId) : store.getRootTasks()
          const idx = siblings.findIndex((s) => s.id === selectedTaskId)
          if (idx > 0) {
            store.moveTask(selectedTaskId, task.parentId, idx - 1)
          }
          return
        }
        return
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault()
          moveDown()
          break
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault()
          moveUp()
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (!selectedTaskId) return
          store.startAddingSubtask(selectedTaskId)
          break
        }
        case 'i': {
          e.preventDefault()
          if (!selectedTaskId) return
          store.startEditing(selectedTaskId)
          break
        }
        case 'h':
        case 'ArrowLeft': {
          if (e.metaKey || e.ctrlKey) return
          e.preventDefault()
          collapseSelected()
          break
        }
        case 'l':
        case 'ArrowRight': {
          if (e.metaKey || e.ctrlKey) return
          e.preventDefault()
          expandSelected()
          break
        }
        case 'Delete':
        case 'Backspace': {
          e.preventDefault()
          if (!selectedTaskId) return
          store.requestDelete(selectedTaskId)
          break
        }
        case ' ': {
          e.preventDefault()
          if (!selectedTaskId) return
          store.requestMarkDone(selectedTaskId)
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
