import { FolderOpen, Terminal, CheckCircle2, ListTodo } from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function TaskDetail() {
  const { selectedTaskId, getTask, getEffectiveDirectory } = useTaskStore()

  if (!selectedTaskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          {/* Decorative icon cluster */}
          <div className="relative">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-muted/50 border border-border/50">
              <ListTodo className="size-7 text-muted-foreground/30" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex items-center justify-center size-7 rounded-lg bg-primary/10 border border-primary/20">
              <Terminal className="size-3.5 text-primary/50" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground/70" data-testid="no-task-selected">
              Select a task to begin
            </p>
            <p className="text-xs text-muted-foreground/40">
              Choose a task from the sidebar to view details and start a session
            </p>
          </div>
        </div>
      </div>
    )
  }

  const task = getTask(selectedTaskId)
  if (!task) return null

  const effectiveDir = getEffectiveDirectory(task.id)
  const isDone = task.state === 'done'

  return (
    <div className="flex flex-col h-full" data-testid="task-detail">
      {/* Task header */}
      <div className="px-6 pt-5 pb-4 drag-region">
        <div className="no-drag animate-fade-in-up">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <h2
                  className={cn(
                    'text-lg font-semibold tracking-tight truncate',
                    isDone && 'line-through text-muted-foreground'
                  )}
                  data-testid="task-detail-title"
                >
                  {task.description}
                </h2>
                <Badge
                  variant={isDone ? 'secondary' : 'outline'}
                  className={cn(
                    'shrink-0 text-[10px] uppercase tracking-wider font-medium',
                    isDone
                      ? 'bg-success/10 text-success border-success/20'
                      : 'text-muted-foreground'
                  )}
                >
                  {isDone ? (
                    <>
                      <CheckCircle2 className="size-3 mr-0.5" />
                      Done
                    </>
                  ) : (
                    'Active'
                  )}
                </Badge>
              </div>

              {effectiveDir && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay">
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/50" />
                  <code className="truncate max-w-md font-mono text-[11px] bg-muted/50 px-1.5 py-0.5 rounded">
                    {effectiveDir}
                  </code>
                  {!task.directory && (
                    <span className="italic text-muted-foreground/40 text-[11px]">inherited</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Session area placeholder */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up-delay-2">
          <div className="flex items-center justify-center size-12 rounded-xl bg-muted/40 border border-border/40">
            <Terminal className="size-5 text-muted-foreground/25" />
          </div>
          <p className="text-sm text-muted-foreground/40" data-testid="no-active-session">
            No active session
          </p>
        </div>
      </div>
    </div>
  )
}
