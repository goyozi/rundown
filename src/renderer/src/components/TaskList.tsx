import { useState } from 'react'
import { Plus, ListTodo, FolderOpen, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTaskStore } from '@/store/task-store'
import { useDirectoryPicker } from '@/hooks/use-directory-picker'
import { useShallow } from 'zustand/react/shallow'
import { DndTaskTree } from './DndTaskTree'
import { GroupSelector } from './GroupSelector'
import { SettingsDialog } from './SettingsDialog'
import { GroupDeleteConfirmDialog } from './GroupDeleteConfirmDialog'

export function TaskList(): React.JSX.Element {
  const {
    getRootTasks,
    addTask,
    groups,
    getActiveGroup,
    removeGroup,
    getGroupTaskCount,
    updateGroupDirectory,
    activeSessions,
    tasks,
    selectTask
  } = useTaskStore(
    useShallow((s) => ({
      getRootTasks: s.getRootTasks,
      addTask: s.addTask,
      groups: s.groups,
      getActiveGroup: s.getActiveGroup,
      removeGroup: s.removeGroup,
      getGroupTaskCount: s.getGroupTaskCount,
      updateGroupDirectory: s.updateGroupDirectory,
      activeSessions: s.activeSessions,
      tasks: s.tasks,
      selectTask: s.selectTask
    }))
  )
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const {
    pickDirectory: handlePickGroupDirectory,
    dirError: groupDirError,
    clearDirError: clearGroupDirError
  } = useDirectoryPicker({
    onValid: (dir) => {
      const freshGroupId = useTaskStore.getState().activeGroupId
      updateGroupDirectory(freshGroupId, dir)
    }
  })

  const rootTasks = getRootTasks()
  const activeGroup = getActiveGroup()

  const handleAddTask = (): void => {
    const trimmed = newTaskDescription.trim()
    if (trimmed) {
      addTask(trimmed)
      setNewTaskDescription('')
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

  const deleteConfirmGroup = deleteConfirm
    ? (groups.find((g) => g.id === deleteConfirm) ?? null)
    : null
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

          <GroupSelector
            open={groupSelectorOpen}
            onOpenChange={setGroupSelectorOpen}
            onDeleteGroup={handleDeleteGroup}
          />
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

      {/* Footer with settings and task count */}
      <Separator className="opacity-60" />
      <div className="flex items-center gap-2 px-3 py-1.5 no-drag">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setSettingsOpen(true)}
              data-testid="settings-button"
            >
              <Settings className="size-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Settings</TooltipContent>
        </Tooltip>
        {rootTasks.length > 0 && (
          <p className="text-[11px] text-muted-foreground/50 tabular-nums">
            {rootTasks.length} {rootTasks.length === 1 ? 'task' : 'tasks'}
          </p>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <GroupDeleteConfirmDialog
        group={deleteConfirmGroup}
        taskCount={deleteConfirmTaskCount}
        hasSessions={deleteConfirmHasSessions}
        onConfirm={confirmDeleteGroup}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Group directory validation error dialog */}
      <Dialog open={!!groupDirError} onOpenChange={(open) => !open && clearGroupDirError()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invalid directory</DialogTitle>
            <DialogDescription>{groupDirError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={clearGroupDirError}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
