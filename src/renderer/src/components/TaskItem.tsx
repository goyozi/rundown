import { useState } from 'react'
import {
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  CheckCircle2,
  Circle,
  FolderOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskStore, type Task } from '@/store/task-store'
import { cn } from '@/lib/utils'

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
}) {
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

export function TaskItem({ task, depth = 0 }: { task: Task; depth?: number }) {
  const {
    selectedTaskId,
    selectTask,
    updateDescription,
    updateDirectory,
    deleteTask,
    markDone,
    markIdle,
    addTask,
    getChildren,
    getDepth,
    getEffectiveDirectory
  } = useTaskStore()

  const [isOpen, setIsOpen] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.description)
  const [isAddingChild, setIsAddingChild] = useState(false)
  const [childDescription, setChildDescription] = useState('')
  const [isHovered, setIsHovered] = useState(false)

  const children = getChildren(task.id)
  const hasChildren = children.length > 0
  const canAddChild = getDepth(task.id) < 4
  const isSelected = selectedTaskId === task.id
  const effectiveDir = getEffectiveDirectory(task.id)
  const isInherited = !task.directory && !!effectiveDir
  const isDone = task.state === 'done'

  const handleSaveEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.description) {
      updateDescription(task.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditValue(task.description)
    setIsEditing(false)
  }

  const handleAddChild = () => {
    const trimmed = childDescription.trim()
    if (trimmed) {
      addTask(trimmed, task.id)
      setChildDescription('')
      setIsAddingChild(false)
      setIsOpen(true)
    }
  }

  const handlePickDirectory = async () => {
    const dir = await window.api.openDirectory()
    if (dir) {
      updateDirectory(task.id, dir)
    }
  }

  const handleToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDone) {
      markIdle(task.id)
    } else {
      markDone(task.id)
    }
  }

  return (
    <div className="w-full task-item-enter">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={cn(
            'group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-all duration-150',
            isSelected
              ? 'bg-accent shadow-[0_0_0_1px_var(--color-primary)/12%] text-accent-foreground'
              : 'hover:bg-muted/60'
          )}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
          onClick={() => selectTask(task.id)}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          data-testid={`task-item-${task.id}`}
          data-task-description={task.description}
          data-task-state={task.state}
        >
          {/* Expand/collapse chevron */}
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 size-5 text-muted-foreground/60"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronRight
                  className={cn(
                    'size-3 transition-transform duration-200',
                    isOpen && 'rotate-90'
                  )}
                />
              </Button>
            </CollapsibleTrigger>
          ) : (
            <div className="w-5 shrink-0" />
          )}

          {/* Done/idle toggle */}
          <button
            onClick={handleToggleDone}
            className={cn(
              'shrink-0 transition-all duration-200',
              isDone
                ? 'text-success hover:text-success/70'
                : 'text-muted-foreground/40 hover:text-muted-foreground'
            )}
            data-testid="toggle-done"
          >
            {isDone ? (
              <CheckCircle2 className="size-[15px]" />
            ) : (
              <Circle className="size-[15px]" />
            )}
          </button>

          {/* Description - editing or display */}
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
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
                'flex-1 text-[13px] leading-snug truncate transition-colors duration-150',
                isDone && 'line-through text-muted-foreground/50'
              )}
            >
              {task.description}
            </span>
          )}

          {/* Hover action buttons */}
          {isHovered && !isEditing && (
            <div className="flex items-center shrink-0">
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
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation()
                  handlePickDirectory()
                }}
                label="Set directory"
              >
                <FolderOpen className="size-2.5" />
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

        {/* Directory indicator */}
        {effectiveDir && isSelected && (
          <div
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 pl-2 pb-1 animate-fade-in-up"
            style={{ paddingLeft: `${depth * 18 + 34}px` }}
          >
            <FolderOpen className="size-3 shrink-0" />
            <span className="truncate">{effectiveDir}</span>
            {isInherited && <span className="italic opacity-70">(inherited)</span>}
          </div>
        )}

        {/* Inline add child */}
        {isAddingChild && (
          <div
            className="flex items-center gap-1 px-2 py-1 animate-fade-in-up"
            style={{ paddingLeft: `${(depth + 1) * 18 + 8}px` }}
          >
            <div className="w-5" />
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
              <TaskItem key={child.id} task={child} depth={depth + 1} />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}
