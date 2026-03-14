import { useState, useRef, useEffect } from 'react'
import {
  Plus,
  ListTodo,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Trash2,
  FolderPlus,
  FolderOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTaskStore } from '@/store/task-store'
import { useTheme } from '@/hooks/use-theme'
import { DndTaskTree } from './DndTaskTree'

const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const
const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' } as const

export function TaskList(): React.JSX.Element {
  const {
    getRootTasks,
    addTask,
    groups,
    activeGroupId,
    getActiveGroup,
    addGroup,
    removeGroup,
    setActiveGroup,
    getGroupTaskCount,
    updateGroupDirectory,
    activeSessions,
    tasks,
    selectTask
  } = useTaskStore()
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false)
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [groupDirError, setGroupDirError] = useState<string | null>(null)
  const { mode, cycle } = useTheme()
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  const rootTasks = getRootTasks()
  const activeGroup = getActiveGroup()
  const Icon = themeIcon[mode]

  useEffect(() => {
    if (isCreatingGroup && newGroupInputRef.current) {
      newGroupInputRef.current.focus()
    }
  }, [isCreatingGroup])

  const handleAddTask = (): void => {
    const trimmed = newTaskDescription.trim()
    if (trimmed) {
      addTask(trimmed)
      setNewTaskDescription('')
    }
  }

  const handleCreateGroup = (): void => {
    const trimmed = newGroupName.trim()
    if (trimmed) {
      addGroup(trimmed)
      setNewGroupName('')
      setIsCreatingGroup(false)
      setGroupSelectorOpen(false)
    }
  }

  const handleDeleteGroup = (groupId: string): void => {
    const groupTasks = tasks.filter((t) => t.groupId === groupId)
    const hasActiveSessions = groupTasks.some((t) => activeSessions.has(t.id))

    if (groupTasks.length > 0 || hasActiveSessions) {
      setDeleteConfirm(groupId)
    } else {
      removeGroup(groupId)
    }
  }

  const confirmDeleteGroup = (): void => {
    if (deleteConfirm) {
      removeGroup(deleteConfirm)
      setDeleteConfirm(null)
    }
  }

  const handlePickGroupDirectory = async (): Promise<void> => {
    const dir = await window.api.openDirectory()
    if (dir) {
      const result = await window.api.validateRepo(dir)
      if (result.valid) {
        setGroupDirError(null)
        updateGroupDirectory(activeGroupId, dir)
      } else {
        setGroupDirError(result.error ?? 'Invalid directory')
      }
    }
  }

  const deleteConfirmGroup = deleteConfirm ? groups.find((g) => g.id === deleteConfirm) : null
  const deleteConfirmTaskCount = deleteConfirm ? getGroupTaskCount(deleteConfirm) : 0
  const deleteConfirmHasSessions = deleteConfirm
    ? tasks.filter((t) => t.groupId === deleteConfirm).some((t) => activeSessions.has(t.id))
    : false

  return (
    <div className="flex flex-col h-full">
      {/* Header with group selector */}
      <div className="px-4 pt-4 pb-3 drag-region">
        <div className="flex items-center gap-2 no-drag">
          <div className="flex items-center justify-center size-6 rounded-md bg-primary/10">
            <ListTodo className="size-3.5 text-primary" />
          </div>

          <Popover open={groupSelectorOpen} onOpenChange={setGroupSelectorOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-1 text-sm font-semibold tracking-tight hover:text-primary/80 transition-colors cursor-pointer rounded-sm px-1 -mx-1 py-0.5 hover:bg-muted/60"
                data-testid="group-selector-trigger"
              >
                <span className="truncate max-w-[140px]">{activeGroup?.name ?? 'Rundown'}</span>
                <ChevronDown className="size-3 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="w-64 p-0"
              data-testid="group-selector-dropdown"
            >
              <div className="py-1.5">
                <div className="px-3 py-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    Groups
                  </p>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {groups.map((group) => {
                    const isActive = group.id === activeGroupId
                    const taskCount = getGroupTaskCount(group.id)
                    const isLastGroup = groups.length <= 1
                    return (
                      <div
                        key={group.id}
                        className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-muted/60 text-foreground'
                        }`}
                        onClick={() => {
                          setActiveGroup(group.id)
                          setGroupSelectorOpen(false)
                        }}
                        data-testid={`group-item-${group.id}`}
                      >
                        <span className="text-sm truncate flex-1">{group.name}</span>
                        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
                          {taskCount}
                        </span>
                        {!isLastGroup && (
                          <button
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteGroup(group.id)
                            }}
                            data-testid={`delete-group-${group.id}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <Separator className="my-1.5 opacity-60" />

                {isCreatingGroup ? (
                  <div className="px-3 py-1.5">
                    <div className="flex gap-1.5">
                      <Input
                        ref={newGroupInputRef}
                        placeholder="Group name..."
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateGroup()
                          if (e.key === 'Escape') {
                            setIsCreatingGroup(false)
                            setNewGroupName('')
                          }
                        }}
                        className="h-7 text-sm"
                        data-testid="new-group-input"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 size-7"
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim()}
                        data-testid="confirm-new-group"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    onClick={() => setIsCreatingGroup(true)}
                    data-testid="new-group-button"
                  >
                    <FolderPlus className="size-3.5" />
                    <span>New Group</span>
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7"
                onClick={cycle}
                data-testid="theme-toggle"
              >
                <Icon className="size-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{themeLabel[mode]}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Group directory */}
      <div className="px-4 pb-3 no-drag">
        <button
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground cursor-pointer transition-colors w-full truncate"
          onClick={handlePickGroupDirectory}
          data-testid="group-directory-picker"
        >
          <FolderOpen className="size-3 shrink-0" />
          {activeGroup?.directory ? (
            <span className="font-mono truncate">{activeGroup.directory}</span>
          ) : (
            <span>Set group directory...</span>
          )}
        </button>
      </div>

      <Separator className="opacity-60" />

      {/* Add task input */}
      <div className="p-3 no-drag">
        <div className="flex gap-1.5">
          <Input
            placeholder="Add a task..."
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTask()
              if (e.key === 'Escape' || e.key === 'ArrowDown') {
                e.preventDefault()
                ;(e.target as HTMLElement).blur()
                if (rootTasks.length > 0) {
                  selectTask(rootTasks[0].id)
                }
              }
            }}
            className="h-8 text-sm bg-background/60 placeholder:text-muted-foreground/60"
            data-testid="new-task-input"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleAddTask}
            disabled={!newTaskDescription.trim()}
            className="shrink-0"
            data-testid="add-task-button"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Task list */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {rootTasks.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in-up"
              data-testid="empty-task-list"
            >
              <div className="flex items-center justify-center size-10 rounded-xl bg-muted/80 mb-3">
                <ListTodo className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No tasks yet</p>
              <p className="text-xs text-muted-foreground/60">
                Create your first task above to get started
              </p>
            </div>
          ) : (
            <DndTaskTree tasks={rootTasks} />
          )}
        </div>
      </ScrollArea>

      {/* Footer with task count */}
      {rootTasks.length > 0 && (
        <>
          <Separator className="opacity-60" />
          <div className="px-4 py-2">
            <p className="text-[11px] text-muted-foreground/50 tabular-nums">
              {rootTasks.length} {rootTasks.length === 1 ? 'task' : 'tasks'}
            </p>
          </div>
        </>
      )}

      {/* Delete group confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete group &ldquo;{deleteConfirmGroup?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              {deleteConfirmHasSessions && <>Active sessions in this group will be stopped. </>}
              {deleteConfirmTaskCount > 0 ? (
                <>
                  This will permanently delete {deleteConfirmTaskCount}{' '}
                  {deleteConfirmTaskCount === 1 ? 'task' : 'tasks'} and all sub-tasks.
                </>
              ) : (
                <>This group is empty and will be removed.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteGroup}
              data-testid="confirm-delete-group"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group directory validation error dialog */}
      <Dialog open={!!groupDirError} onOpenChange={(open) => !open && setGroupDirError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalid directory</DialogTitle>
            <DialogDescription>{groupDirError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setGroupDirError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
