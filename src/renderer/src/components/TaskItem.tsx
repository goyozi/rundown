import React, { useState } from 'react'
import {
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  CheckCircle2,
  Circle,
  Loader2
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTaskStore, type Task } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { cn } from '@/lib/utils'
import type { DropIntent } from './DndTaskTree'

function ActionButton({
  onClick,
  label,
  className,
  testId,
  children
}: {
  onClick: (e: React.MouseEvent) => void
  label: string
  className?: string
  testId?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn('size-5 text-muted-foreground hover:text-foreground', className)}
          onClick={onClick}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

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
    deleteTask,
    markDone,
    markIdle,
    addTask,
    getChildren,
    getDepth,
    activeSessions,
    stopSession
  } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      _tasks: s.tasks, // trigger re-renders for getChildren/getDepth
      selectTask: s.selectTask,
      updateDescription: s.updateDescription,
      deleteTask: s.deleteTask,
      markDone: s.markDone,
      markIdle: s.markIdle,
      addTask: s.addTask,
      getChildren: s.getChildren,
      getDepth: s.getDepth,
      activeSessions: s.activeSessions,
      stopSession: s.stopSession
    }))
  )

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: task.id
  })

  const [isOpen, setIsOpen] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.description)
  const [isAddingChild, setIsAddingChild] = useState(false)
  const [childDescription, setChildDescription] = useState('')
  const [showDoneConfirm, setShowDoneConfirm] = useState(false)

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
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.description) {
      updateDescription(task.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = (): void => {
    setEditValue(task.description)
    setIsEditing(false)
  }

  const handleAddChild = (): void => {
    const trimmed = childDescription.trim()
    if (trimmed) {
      addTask(trimmed, task.id)
      setChildDescription('')
      setIsAddingChild(false)
      setIsOpen(true)
    }
  }

  const handleToggleDone = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (isDone) {
      markIdle(task.id)
    } else if (sessionActive) {
      setShowDoneConfirm(true)
    } else {
      markDone(task.id)
    }
  }

  const handleConfirmDone = async (): Promise<void> => {
    await window.api.ptyKill(task.id)
    stopSession(task.id)
    markDone(task.id)
    setShowDoneConfirm(false)
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

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={cn(
            'group flex items-start gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-150 touch-none',
            isSelected
              ? 'bg-accent shadow-[0_0_0_1px_var(--color-primary)/12%] text-accent-foreground'
              : 'hover:bg-muted/60',
            dropPosition === 'inside' && 'drop-nest-target bg-primary/10 rounded-md'
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => selectTask(task.id)}
          data-testid={`task-item-${task.id}`}
          data-task-description={task.description}
          data-task-state={sessionActive ? 'in-progress' : task.state}
          {...(isEditing ? {} : { ...attributes, ...listeners })}
        >
          {/* Expand/collapse chevron */}
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 size-5 mt-px text-muted-foreground/60"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronRight
                  className={cn('size-3 transition-transform duration-200', isOpen && 'rotate-90')}
                />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <div className="w-3 shrink-0" />
          )}

          {/* Done/idle/in-progress toggle */}
          <button
            onClick={handleToggleDone}
            className={cn(
              'shrink-0 mt-px transition-all duration-200',
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
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                className="h-6 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon-xs" className="size-5" onClick={handleSaveEdit}>
                <Check className="size-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" className="size-5" onClick={handleCancelEdit}>
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

          {/* Hover action buttons */}
          {!isEditing && (
            <div className="flex items-center shrink-0 mt-px opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation()
                  setEditValue(task.description)
                  setIsEditing(true)
                }}
                label="Edit"
                testId="edit-task"
              >
                <Pencil className="size-2.5" />
              </ActionButton>
              {canAddChild && (
                <ActionButton
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsAddingChild(true)
                  }}
                  label="Add sub-task"
                  testId="add-subtask"
                >
                  <Plus className="size-2.5" />
                </ActionButton>
              )}
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTask(task.id)
                }}
                label="Delete"
                className="hover:text-destructive"
                testId="delete-task"
              >
                <Trash2 className="size-2.5" />
              </ActionButton>
            </div>
          )}
        </div>

        {/* Inline add child */}
        {isAddingChild && (
          <div
            className="flex items-center gap-1 px-2 py-1 animate-fade-in-up"
            style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
          >
            <div className="w-3" />
            <Input
              data-testid="subtask-input"
              placeholder="Sub-task..."
              value={childDescription}
              onChange={(e) => setChildDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChild()
                if (e.key === 'Escape') {
                  setIsAddingChild(false)
                  setChildDescription('')
                }
              }}
              className="h-6 text-sm flex-1"
              autoFocus
            />
            <Button variant="ghost" size="icon-xs" className="size-5" onClick={handleAddChild}>
              <Check className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-5"
              onClick={() => {
                setIsAddingChild(false)
                setChildDescription('')
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {hasChildren && (
          <CollapsibleContent>
            {children.map((child) => (
              <TaskItem
                key={child.id}
                task={child}
                depth={depth + 1}
                dropIntent={dropIntent}
                activeDragId={activeDragId}
              />
            ))}
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

      {/* Confirmation dialog for marking done with active session */}
      <Dialog open={showDoneConfirm} onOpenChange={setShowDoneConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop session and mark as done?</DialogTitle>
            <DialogDescription>
              A session is still active. Stop the session and mark as done?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDoneConfirm(false)}
              data-testid="cancel-done"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmDone} data-testid="confirm-done">
              Yes, mark as done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
