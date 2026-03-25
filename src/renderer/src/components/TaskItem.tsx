import React, { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  CheckCircle2,
  Circle,
  Loader2,
  CornerDownLeft
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useTaskStore, type Task } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/utils'
import type { DropIntent } from './DndTaskTree'

export function TaskItem({
  task,
  depth = 0,
  dropIntent,
  activeDragId
}: {
  task: Task
  depth?: number
  dropIntent?: DropIntent | null
  activeDragId?: string | null
}): React.ReactElement {
  const {
    selectedTaskId,
    selectTask,
    updateDescription,
    addTask,
    getChildren,
    getDepth,
    activeSessions,
    requestDelete,
    requestMarkDone,
    editingTaskId,
    addingSubtaskForTaskId,
    collapsedTaskIds,
    startEditing,
    stopEditing,
    startAddingSubtask,
    stopAddingSubtask,
    toggleCollapsed
  } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      selectTask: s.selectTask,
      updateDescription: s.updateDescription,
      addTask: s.addTask,
      getChildren: s.getChildren,
      getDepth: s.getDepth,
      activeSessions: s.activeSessions,
      requestDelete: s.requestDelete,
      requestMarkDone: s.requestMarkDone,
      editingTaskId: s.editingTaskId,
      addingSubtaskForTaskId: s.addingSubtaskForTaskId,
      collapsedTaskIds: s.collapsedTaskIds,
      startEditing: s.startEditing,
      stopEditing: s.stopEditing,
      startAddingSubtask: s.startAddingSubtask,
      stopAddingSubtask: s.stopAddingSubtask,
      toggleCollapsed: s.toggleCollapsed
    }))
  )

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: task.id
  })

  const editInputRef = React.useRef<HTMLInputElement>(null)
  const [childDescription, setChildDescription] = useState('')
  const subtaskInputRef = useRef<HTMLInputElement>(null)
  const isOpen = !collapsedTaskIds.has(task.id)
  const isEditing = editingTaskId === task.id
  const isAddingChild = addingSubtaskForTaskId === task.id

  useEffect(() => {
    if (!isAddingChild) return
    // Delay focus so it fires after the context menu restores focus to its trigger
    const timer = requestAnimationFrame(() => subtaskInputRef.current?.focus())
    return () => cancelAnimationFrame(timer)
  }, [isAddingChild])

  const children = getChildren(task.id)
  const hasChildren = children.length > 0
  const canAddChild = getDepth(task.id) < 4
  const isSelected = selectedTaskId === task.id
  const isDone = task.state === 'done'
  const sessionActive = activeSessions.has(task.id)

  // Drop intent for this specific task
  const isDropTarget = dropIntent?.targetId === task.id
  const dropPosition = isDropTarget ? dropIntent.position : null

  const handleSaveEdit = (): void => {
    const trimmed = editInputRef.current?.value.trim()
    if (trimmed && trimmed !== task.description) {
      updateDescription(task.id, trimmed)
    }
    stopEditing()
  }

  const handleCancelEdit = (): void => {
    stopEditing()
  }

  const handleAddChild = (): void => {
    const trimmed = childDescription.trim()
    if (trimmed) {
      addTask(trimmed, task.id)
      setChildDescription('')
      stopAddingSubtask()
      // Ensure parent is expanded to show the new child
      if (collapsedTaskIds.has(task.id)) {
        toggleCollapsed(task.id)
      }
    }
  }

  const handleToggleDone = (e: React.MouseEvent): void => {
    e.stopPropagation()
    requestMarkDone(task.id)
  }

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      className={cn('w-full task-item-enter relative', isDragging && 'opacity-20')}
    >
      {/* Drop indicator — before */}
      {dropPosition === 'before' && (
        <div
          className="drop-line absolute top-0 left-2 right-2 z-10 transition-all duration-150 ease-out"
          style={{ marginLeft: `${depth * 16}px` }}
        />
      )}

      <Collapsible open={isOpen} onOpenChange={() => toggleCollapsed(task.id)}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer transition-all duration-150 touch-none outline-none',
                isSelected
                  ? 'bg-accent shadow-[0_0_0_1px_var(--color-primary)/12%] text-accent-foreground'
                  : 'hover:bg-muted/60',
                dropPosition === 'inside' && 'drop-nest-target bg-primary/10 rounded-md'
              )}
              style={{ paddingLeft: `${depth * 21 + 10}px` }}
              onClick={() => selectTask(task.id)}
              onDoubleClick={() => startEditing(task.id)}
              data-testid={`task-item-${task.id}`}
              data-task-description={task.description}
              data-task-state={sessionActive ? 'in-progress' : task.state}
              {...(isEditing ? {} : { ...attributes, ...listeners })}
            >
              {/* Done/idle/in-progress toggle */}
              <button
                onClick={handleToggleDone}
                className={cn(
                  'shrink-0 transition-all duration-200',
                  isDone
                    ? 'text-success hover:text-success/70'
                    : sessionActive
                      ? 'text-primary hover:text-primary/70'
                      : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
                data-testid="toggle-done"
              >
                {isDone ? (
                  <CheckCircle2 className="size-[15px]" />
                ) : sessionActive ? (
                  <Loader2 className="size-[15px] animate-spin" />
                ) : (
                  <Circle className="size-[15px]" />
                )}
              </button>

              {/* Description - editing or display */}
              {isEditing ? (
                <div
                  className="flex items-center gap-1 flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    ref={editInputRef}
                    defaultValue={task.description}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit()
                      if (e.key === 'Escape') handleCancelEdit()
                    }}
                    className="h-6 text-sm"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5"
                    onClick={handleSaveEdit}
                  >
                    <Check className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-5"
                    onClick={handleCancelEdit}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ) : (
                <span
                  className={cn(
                    'flex-1 text-[13px] leading-snug min-w-0 break-words transition-colors duration-150',
                    isDone && 'line-through text-muted-foreground/50'
                  )}
                >
                  {task.description}
                </span>
              )}

              {/* Expand/collapse chevron — right side, always visible when has children */}
              {hasChildren && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 size-5 text-muted-foreground/60 hover:text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ChevronDown
                      className={cn(
                        'size-3 transition-transform duration-200',
                        !isOpen && 'rotate-90'
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem
              className="flex items-center justify-between text-[13px]"
              data-testid="edit-task"
              onSelect={() => startEditing(task.id)}
            >
              <span className="flex items-center gap-2">
                <Pencil className="size-3.5 text-muted-foreground" />
                Edit
              </span>
              <kbd className="ml-auto text-[11px] tracking-widest text-muted-foreground">i</kbd>
            </ContextMenuItem>
            {canAddChild && (
              <ContextMenuItem
                className="flex items-center justify-between text-[13px]"
                data-testid="add-subtask"
                onSelect={() => {
                  startAddingSubtask(task.id)
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus className="size-3.5 text-muted-foreground" />
                  Add sub-task
                </span>
                <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" />
              </ContextMenuItem>
            )}
            <ContextMenuItem
              className="flex items-center justify-between text-[13px] text-destructive focus:text-destructive"
              data-testid="delete-task"
              onSelect={() => {
                requestDelete(task.id)
              }}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="size-3.5" />
                Delete
              </span>
              <kbd className="ml-auto text-[11px] tracking-widest opacity-70">del</kbd>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Inline add child */}
        {isAddingChild && (
          <div
            className="flex items-center gap-1 px-2 py-1 animate-fade-in-up"
            style={{ paddingLeft: `${(depth + 1) * 21 + 10}px` }}
          >
            <Input
              ref={subtaskInputRef}
              data-testid="subtask-input"
              placeholder="Sub-task..."
              value={childDescription}
              onChange={(e) => setChildDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChild()
                if (e.key === 'Escape') {
                  stopAddingSubtask()
                  setChildDescription('')
                }
              }}
              className="h-6 text-sm flex-1"
            />
            <Button variant="ghost" size="icon-xs" className="size-5" onClick={handleAddChild}>
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-5"
              onClick={() => {
                stopAddingSubtask()
                setChildDescription('')
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {hasChildren && (
          <CollapsibleContent>
            <div className="relative">
              {/* Vertical connector line — aligned with this item's toggle center */}
              <div
                className="absolute top-0 bottom-0 w-px bg-border/60"
                style={{ left: `${depth * 21 + 17}px` }}
              />
              {children.map((child) => (
                <TaskItem
                  key={child.id}
                  task={child}
                  depth={depth + 1}
                  dropIntent={dropIntent}
                  activeDragId={activeDragId}
                />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>

      {/* Drop indicator — after */}
      {dropPosition === 'after' && (
        <div
          className="drop-line absolute bottom-0 left-2 right-2 z-10 transition-all duration-150 ease-out"
          style={{ marginLeft: `${depth * 16}px` }}
        />
      )}
    </div>
  )
}
