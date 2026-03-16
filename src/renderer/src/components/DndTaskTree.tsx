import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTaskStore, type Task } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { TaskItem } from './TaskItem'
import { useTaskKeyboardNav } from '@/hooks/use-task-keyboard-nav'
import { Circle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const END_DROP_ID = '__END__'

export interface DropIntent {
  targetId: string
  position: 'before' | 'after' | 'inside'
}

export function DndTaskTree({ tasks }: { tasks: Task[] }): React.ReactElement {
  const { moveTask, activeSessions, allTasks } = useTaskStore(
    useShallow((s) => ({
      moveTask: s.moveTask,
      activeSessions: s.activeSessions,
      allTasks: s.tasks
    }))
  )
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null)
  const dropIntentRef = useRef<DropIntent | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)
  useTaskKeyboardNav(treeContainerRef)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Collect all task IDs recursively for SortableContext
  const allIds = useMemo(() => {
    const { getChildren } = useTaskStore.getState()
    function collect(taskList: Task[]): string[] {
      const ids: string[] = []
      for (const task of taskList) {
        ids.push(task.id)
        const children = getChildren(task.id)
        if (children.length > 0) {
          ids.push(...collect(children))
        }
      }
      return ids
    }
    return collect(tasks)
    // allTasks triggers recompute when any task (including children) changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, allTasks])

  const findTaskById = useCallback(
    (id: string): Task | undefined => {
      const { getChildren } = useTaskStore.getState()
      const search = (list: Task[]): Task | undefined => {
        for (const t of list) {
          if (t.id === id) return t
          const children = getChildren(t.id)
          const found = search(children)
          if (found) return found
        }
        return undefined
      }
      return search(tasks)
    },
    [tasks]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = findTaskById(String(event.active.id))
      setActiveId(event.active.id)
      setActiveTask(task ?? null)
    },
    [findTaskById]
  )

  const computePosition = useCallback(
    (
      event: DragOverEvent | DragEndEvent,
      overId: string,
      activeIdStr: string
    ): 'before' | 'after' | 'inside' | null => {
      const { isDescendant, getDepth, getMaxSubtreeDepth } = useTaskStore.getState()
      if (isDescendant(activeIdStr, overId)) return null

      const overRect = event.over?.rect
      if (!overRect) return null

      const pointerY = (event.activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0)
      const relativeY = pointerY - overRect.top
      const ratio = relativeY / overRect.height

      // Position-based nesting: if cursor is to the right of the target's content area, nest.
      // This is direction-agnostic — works the same whether dragging up or down.
      const pointerX = (event.activatorEvent as PointerEvent).clientX + (event.delta?.x ?? 0)
      const targetDepthPx = overRect.left + getDepth(overId) * 16 + 24
      const NEST_THRESHOLD = 30 // px past target's content start to trigger nesting

      let position: 'before' | 'after' | 'inside'

      if (pointerX > targetDepthPx + NEST_THRESHOLD) {
        // Cursor is well to the right of the target → nest inside
        if (ratio < 0.1) {
          position = 'before'
        } else if (ratio > 0.9) {
          position = 'after'
        } else {
          position = 'inside'
        }
      } else {
        // Cursor is at or left of the target's content → reorder only
        position = ratio < 0.5 ? 'before' : 'after'
      }

      // Validate 'inside' — check depth constraint
      if (position === 'inside') {
        const targetDepth = getDepth(overId) + 1
        const subtreeDepth = getMaxSubtreeDepth(activeIdStr)
        if (targetDepth + subtreeDepth > 4) {
          position = ratio < 0.5 ? 'before' : 'after'
        }
      }

      return position
    },
    []
  )

  const updateDropIntent = useCallback((intent: DropIntent | null) => {
    setDropIntent(intent)
    dropIntentRef.current = intent
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over, active } = event
      if (!over || over.id === active.id) {
        updateDropIntent(null)
        return
      }

      if (String(over.id) === END_DROP_ID) {
        updateDropIntent({ targetId: END_DROP_ID, position: 'after' })
        return
      }

      const overId = String(over.id)
      const activeIdStr = String(active.id)
      const position = computePosition(event, overId, activeIdStr)

      if (!position) {
        updateDropIntent(null)
        return
      }

      updateDropIntent({ targetId: overId, position })
    },
    [computePosition, updateDropIntent]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event
      // Capture the previewed intent before clearing state
      const intent = dropIntentRef.current

      setActiveId(null)
      updateDropIntent(null)
      setActiveTask(null)

      if (!intent) return

      const { getChildren } = useTaskStore.getState()
      const activeIdStr = String(active.id)
      const { targetId, position } = intent

      // Handle end-of-list drop zone
      if (targetId === END_DROP_ID) {
        moveTask(activeIdStr, undefined, tasks.length)
        return
      }

      // Find the target task to determine its parent
      const findTaskParent = (id: string, list: Task[], parentId?: string): string | undefined => {
        for (const t of list) {
          if (t.id === id) return parentId
          const children = getChildren(t.id)
          const found = findTaskParent(id, children, t.id)
          if (found !== undefined) return found
        }
        return undefined
      }

      if (position === 'inside') {
        moveTask(activeIdStr, targetId, 0)
      } else {
        const overParentId = findTaskParent(targetId, tasks)
        const siblings = overParentId
          ? getChildren(overParentId).map((t) => t.id)
          : tasks.map((t) => t.id)

        const targetIndex = siblings.indexOf(targetId)
        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
        moveTask(activeIdStr, overParentId, insertIndex)
      }
    },
    [moveTask, tasks, updateDropIntent]
  )

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    updateDropIntent(null)
    setActiveTask(null)
  }, [updateDropIntent])

  return (
    <div ref={treeContainerRef}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              dropIntent={dropIntent}
              activeDragId={activeId ? String(activeId) : null}
            />
          ))}
        </SortableContext>

        {activeId !== null && <EndDropZone isOver={dropIntent?.targetId === END_DROP_ID} />}

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <DragOverlayContent
              task={activeTask}
              sessionActive={activeSessions.has(activeTask.id)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function EndDropZone({ isOver }: { isOver: boolean }): React.ReactElement {
  const { setNodeRef } = useDroppable({ id: END_DROP_ID })

  return (
    <div ref={setNodeRef} className="relative h-8">
      {isOver && <div className="drop-line absolute top-0 left-2 right-2" />}
    </div>
  )
}

function DragOverlayContent({
  task,
  sessionActive
}: {
  task: Task
  sessionActive: boolean
}): React.ReactElement {
  const isDone = task.state === 'done'

  return (
    <div className="drag-overlay flex items-center gap-1.5 rounded-md bg-card border border-primary/20 shadow-xl shadow-black/20 px-3 py-1.5 opacity-90 scale-[1.02]">
      <span
        className={cn(
          'shrink-0',
          isDone ? 'text-success' : sessionActive ? 'text-primary' : 'text-muted-foreground/40'
        )}
      >
        {isDone ? (
          <CheckCircle2 className="size-[15px]" />
        ) : sessionActive ? (
          <Loader2 className="size-[15px] animate-spin" />
        ) : (
          <Circle className="size-[15px]" />
        )}
      </span>
      <span className="text-[13px] leading-snug truncate max-w-[250px]">{task.description}</span>
    </div>
  )
}
