import { useEffect, useState, useCallback, useRef } from 'react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { getMruExcludingCurrent } from '@/lib/navigation'
import { Circle, CheckCircle2 } from 'lucide-react'

interface RecentTaskSwitcherProps {
  onClose: () => void
}

export function RecentTaskSwitcher({ onClose }: RecentTaskSwitcherProps): React.JSX.Element | null {
  const { rawMruList, selectedTaskId, navigateToTask, tasks, groups } = useTaskStore(
    useShallow((s) => ({
      rawMruList: s.mruList,
      selectedTaskId: s.selectedTaskId,
      navigateToTask: s.navigateToTask,
      tasks: s.tasks,
      groups: s.groups
    }))
  )
  const mruList = getMruExcludingCurrent(rawMruList, selectedTaskId)

  const [highlightIndex, setHighlightIndex] = useState(0)
  const committedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Build breadcrumbs for display
  const items = mruList.map((entry) => {
    const task = tasks.find((t) => t.id === entry.taskId)
    const group = groups.find((g) => g.id === entry.groupId)
    const groupName = group?.name ?? ''
    const description = task?.description ?? 'Unknown task'
    const state = task?.state ?? 'idle'
    return { ...entry, description, groupName, state }
  })

  const commit = useCallback(
    (index: number) => {
      if (committedRef.current) return
      committedRef.current = true
      const item = items[index]
      if (item) {
        navigateToTask(item.taskId, item.groupId)
      }
      onClose()
    },
    [items, navigateToTask, onClose]
  )

  const cancel = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    onClose()
  }, [onClose])

  // Keydown/keyup lifecycle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          // Move highlight backwards with wrap
          setHighlightIndex((i) => (i - 1 + items.length) % items.length)
        } else {
          // Move highlight forward with wrap
          setHighlightIndex((i) => (i + 1) % items.length)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        return
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      // Release Meta/Cmd = commit
      if (e.key === 'Meta' || e.key === 'Control') {
        commit(highlightIndex)
      }
    }

    const handleBlur = (): void => {
      // Window lost focus while CMD held — commit
      commit(highlightIndex)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [items.length, highlightIndex, commit, cancel])

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Close if the list becomes empty (e.g. all tasks deleted while open)
  useEffect(() => {
    if (items.length === 0) {
      onClose()
    }
  }, [items.length, onClose])

  if (items.length === 0) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={cancel}
      data-testid="recent-task-switcher-overlay"
    >
      <div
        className="absolute inset-x-0 flex justify-center pl-[80px] pointer-events-none"
        style={{ top: 36 }}
      >
        <div
          className="w-full max-w-[600px] mx-4 bg-popover border border-border rounded-b-lg shadow-lg overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">
            Recent Tasks
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto" role="listbox">
            {items.map((item, index) => (
              <div
                key={item.taskId}
                role="option"
                aria-selected={index === highlightIndex}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm ${
                  index === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => {
                  navigateToTask(item.taskId, item.groupId)
                  onClose()
                }}
                onMouseEnter={() => setHighlightIndex(index)}
                data-testid="recent-task-result"
              >
                {item.state === 'done' ? (
                  <CheckCircle2 className="size-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground/60 text-xs">{item.groupName} &gt; </span>
                  <span className="text-foreground">{item.description}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground/60">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">⌘E</kbd> next
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">⇧⌘E</kbd> prev
            </span>
            <span>release ⌘ to switch</span>
          </div>
        </div>
      </div>
    </div>
  )
}
