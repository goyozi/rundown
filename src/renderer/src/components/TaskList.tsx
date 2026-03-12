import { useState } from 'react'
import { Plus, ListTodo, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskStore } from '@/store/task-store'
import { useTheme } from '@/hooks/use-theme'
import { TaskItem } from './TaskItem'

const themeIcon = { light: Sun, dark: Moon, system: Monitor } as const
const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' } as const

export function TaskList() {
  const { getRootTasks, addTask } = useTaskStore()
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const { mode, cycle } = useTheme()

  const rootTasks = getRootTasks()
  const Icon = themeIcon[mode]

  const handleAddTask = () => {
    const trimmed = newTaskDescription.trim()
    if (trimmed) {
      addTask(trimmed)
      setNewTaskDescription('')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 drag-region">
        <div className="flex items-center gap-2 no-drag">
          <div className="flex items-center justify-center size-6 rounded-md bg-primary/10">
            <ListTodo className="size-3.5 text-primary" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">Rundown</h1>
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
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in-up" data-testid="empty-task-list">
              <div className="flex items-center justify-center size-10 rounded-xl bg-muted/80 mb-3">
                <ListTodo className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                No tasks yet
              </p>
              <p className="text-xs text-muted-foreground/60">
                Create your first task above to get started
              </p>
            </div>
          ) : (
            rootTasks.map((task) => <TaskItem key={task.id} task={task} />)
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
    </div>
  )
}
