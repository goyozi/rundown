import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { buildSearchableList, searchTasks } from '@/lib/task-search'
import { Check, Circle } from 'lucide-react'

interface GoToTaskProps {
  open: boolean
  onClose: () => void
}

export function GoToTask({ open, onClose }: GoToTaskProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { tasks, groups, activeGroupId, setActiveGroup, selectTask } = useTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      groups: s.groups,
      activeGroupId: s.activeGroupId,
      setActiveGroup: s.setActiveGroup,
      selectTask: s.selectTask
    }))
  )

  const searchableList = useMemo(() => buildSearchableList(tasks, groups), [tasks, groups])
  const results = useMemo(() => searchTasks(query, searchableList), [query, searchableList])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlightIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  const navigateToTask = useCallback(
    (taskId: string, groupId: string) => {
      if (groupId !== activeGroupId) {
        setActiveGroup(groupId)
      }
      // setActiveGroup clears selectedTaskId, so we always call selectTask after
      // Use requestAnimationFrame to ensure the group switch has rendered
      requestAnimationFrame(() => {
        selectTask(taskId)
      })
      onClose()
    },
    [activeGroupId, setActiveGroup, selectTask, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const result = results[highlightIndex]
        if (result) {
          navigateToTask(result.task.id, result.task.groupId)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results, highlightIndex, navigateToTask, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
      data-testid="go-to-task-overlay"
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 w-full max-w-[600px]"
        style={{ top: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-popover border border-border rounded-b-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Go to Task…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              data-testid="go-to-task-input"
            />
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto" role="listbox">
            {results.length === 0 && query.trim() && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching tasks
              </div>
            )}
            {results.map((result, index) => (
              <div
                key={result.task.id}
                role="option"
                aria-selected={index === highlightIndex}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm ${
                  index === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => navigateToTask(result.task.id, result.task.groupId)}
                onMouseEnter={() => setHighlightIndex(index)}
                data-testid="go-to-task-result"
              >
                {/* State icon */}
                {result.task.state === 'done' ? (
                  <Check className="size-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                )}

                {/* Breadcrumb with highlighting */}
                <span className="flex-1 truncate text-muted-foreground">
                  <HighlightedBreadcrumb
                    text={result.task.breadcrumb}
                    matchedIndices={result.matchedIndices}
                  />
                </span>

                {/* State label */}
                <span className="text-xs text-muted-foreground/60 shrink-0 capitalize">
                  {result.task.state}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground/60">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> go to task
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HighlightedBreadcrumb({
  text,
  matchedIndices
}: {
  text: string
  matchedIndices: number[]
}): React.JSX.Element {
  if (matchedIndices.length === 0) {
    return <>{text}</>
  }

  const matchSet = new Set(matchedIndices)
  const parts: React.JSX.Element[] = []
  let i = 0

  while (i < text.length) {
    if (matchSet.has(i)) {
      // Collect consecutive matched chars
      let end = i
      while (end < text.length && matchSet.has(end)) end++
      parts.push(
        <span key={i} className="text-primary font-medium">
          {text.slice(i, end)}
        </span>
      )
      i = end
    } else {
      let end = i
      while (end < text.length && !matchSet.has(end)) end++
      parts.push(<span key={i}>{text.slice(i, end)}</span>)
      i = end
    }
  }

  return <>{parts}</>
}
