import React from 'react'
import { FolderOpen, CheckCircle2, Play, Square, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Task } from '@/store/task-store'

interface TaskHeaderProps {
  task: Task
  effectiveDir: string | undefined
  isInherited: boolean
  sessionActive: boolean
  isDone: boolean
  isStarting: boolean
  onPickDirectory: () => void
  onStartSession: () => void
  onStopSession: () => void
}

export function TaskHeader({
  task,
  effectiveDir,
  isInherited,
  sessionActive,
  isDone,
  isStarting,
  onPickDirectory,
  onStartSession,
  onStopSession
}: TaskHeaderProps): React.ReactElement {
  const isInProgress = sessionActive

  const stateBadge = isInProgress ? (
    <Badge
      variant="outline"
      className="shrink-0 text-[10px] uppercase tracking-wider font-medium bg-primary/10 text-primary border-primary/20"
    >
      <Loader2 className="size-3 mr-0.5 animate-spin" />
      In Progress
    </Badge>
  ) : isDone ? (
    <Badge
      variant="secondary"
      className="shrink-0 text-[10px] uppercase tracking-wider font-medium bg-success/10 text-success border-success/20"
    >
      <CheckCircle2 className="size-3 mr-0.5" />
      Done
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="shrink-0 text-[10px] uppercase tracking-wider font-medium text-muted-foreground"
    >
      Idle
    </Badge>
  )

  return (
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
              {stateBadge}
            </div>

            {/* Directory display */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay">
              {effectiveDir ? (
                <>
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/50" />
                  <button
                    className={cn(
                      'truncate max-w-md font-mono text-[11px] bg-muted/50 px-1.5 py-0.5 rounded transition-colors',
                      sessionActive ? 'cursor-default' : 'hover:bg-muted cursor-pointer'
                    )}
                    onClick={onPickDirectory}
                    data-testid="directory-display"
                  >
                    {effectiveDir}
                  </button>
                  {isInherited && (
                    <span className="italic text-muted-foreground/40 text-[11px]">inherited</span>
                  )}
                </>
              ) : (
                <button
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground cursor-pointer transition-colors"
                  onClick={onPickDirectory}
                  data-testid="set-directory"
                >
                  <FolderOpen className="size-3.5 shrink-0" />
                  <span>Set directory...</span>
                </button>
              )}
            </div>
          </div>

          {/* Session controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {sessionActive ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onStopSession}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    data-testid="stop-session"
                  >
                    <Square className="size-3.5 mr-1.5 fill-current" />
                    Stop Session
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kill the active Claude Code session</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onStartSession}
                    disabled={!effectiveDir || isStarting}
                    data-testid="start-session"
                  >
                    {isStarting ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5 mr-1.5 fill-current" />
                    )}
                    Start Session
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {effectiveDir
                    ? 'Launch Claude Code in the task directory'
                    : 'Assign a directory first'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
