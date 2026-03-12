import { useState } from 'react'
import {
  FolderOpen,
  Terminal,
  CheckCircle2,
  ListTodo,
  AlertCircle,
  Play,
  Square,
  Loader2,
  Code2
} from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TerminalPanel } from './TerminalPanel'
import { ReviewPanel } from './ReviewPanel'
import { cn } from '@/lib/utils'

type DetailTab = 'terminal' | 'review'

export function TaskDetail() {
  const {
    selectedTaskId,
    getTask,
    getEffectiveDirectory,
    updateDirectory,
    activeSessions,
    startSession,
    stopSession
  } = useTaskStore()
  const [dirInput, setDirInput] = useState('')
  const [dirError, setDirError] = useState<string | null>(null)
  const [isEditingDir, setIsEditingDir] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('terminal')

  if (!selectedTaskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <div className="relative">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-muted/50 border border-border/50">
              <ListTodo className="size-7 text-muted-foreground/30" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex items-center justify-center size-7 rounded-lg bg-primary/10 border border-primary/20">
              <Terminal className="size-3.5 text-primary/50" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p
              className="text-sm font-medium text-muted-foreground/70"
              data-testid="no-task-selected"
            >
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
  const isInherited = !task.directory && !!effectiveDir
  const sessionActive = activeSessions.has(task.id)
  const isInProgress = sessionActive

  const handlePickDirectory = async () => {
    const dir = await window.api.openDirectory()
    if (dir) {
      const result = await window.api.validateRepo(dir)
      if (result.valid) {
        setDirError(null)
        updateDirectory(task.id, dir)
        setIsEditingDir(false)
      } else {
        setDirError(result.error ?? 'Invalid directory')
      }
    }
  }

  const handleSubmitDir = async () => {
    const trimmed = dirInput.trim()
    if (!trimmed) {
      updateDirectory(task.id, undefined)
      setDirError(null)
      setIsEditingDir(false)
      return
    }
    const result = await window.api.validateRepo(trimmed)
    if (result.valid) {
      setDirError(null)
      updateDirectory(task.id, trimmed)
      setIsEditingDir(false)
    } else {
      setDirError(result.error ?? 'Invalid directory')
    }
  }

  const startEditingDir = () => {
    if (sessionActive) return
    setDirInput(task.directory ?? '')
    setDirError(null)
    setIsEditingDir(true)
  }

  const handleStartSession = async () => {
    if (!effectiveDir || isStarting) return
    setIsStarting(true)
    try {
      const result = await window.api.ptySpawn(task.id, effectiveDir)
      if (result.success) {
        startSession(task.id)
      }
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopSession = async () => {
    await window.api.ptyKill(task.id)
    stopSession(task.id)
  }

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
                {stateBadge}
              </div>

              {/* Directory display / edit */}
              {isEditingDir ? (
                <div className="flex flex-col gap-1.5 animate-fade-in-up-delay">
                  <div className="flex items-center gap-1.5">
                    <Input
                      data-testid="directory-input"
                      value={dirInput}
                      onChange={(e) => {
                        setDirInput(e.target.value)
                        setDirError(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmitDir()
                        if (e.key === 'Escape') {
                          setIsEditingDir(false)
                          setDirError(null)
                        }
                      }}
                      placeholder="Paste a path to a Git repository..."
                      className="h-7 text-xs font-mono flex-1"
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handlePickDirectory}
                      data-testid="browse-directory"
                    >
                      <FolderOpen className="size-3 mr-1" />
                      Browse
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleSubmitDir}
                      data-testid="save-directory"
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setIsEditingDir(false)
                        setDirError(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {dirError && (
                    <div
                      className="flex items-center gap-1 text-destructive text-[11px]"
                      data-testid="directory-error"
                    >
                      <AlertCircle className="size-3 shrink-0" />
                      <span>{dirError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay">
                  {effectiveDir ? (
                    <>
                      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/50" />
                      <button
                        className={cn(
                          'truncate max-w-md font-mono text-[11px] bg-muted/50 px-1.5 py-0.5 rounded transition-colors',
                          sessionActive
                            ? 'cursor-default'
                            : 'hover:bg-muted cursor-pointer'
                        )}
                        onClick={startEditingDir}
                        data-testid="directory-display"
                      >
                        {effectiveDir}
                      </button>
                      {isInherited && (
                        <span className="italic text-muted-foreground/40 text-[11px]">
                          inherited
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground cursor-pointer transition-colors"
                      onClick={startEditingDir}
                      data-testid="set-directory"
                    >
                      <FolderOpen className="size-3.5 shrink-0" />
                      <span>Set directory...</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Session controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {sessionActive ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStopSession}
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
                      onClick={handleStartSession}
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

      <Separator />

      {/* Tab bar - show when session active or directory available for review */}
      {(sessionActive || effectiveDir) && (
        <div className="flex items-center border-b border-border/50 bg-muted/10 px-4">
          <button
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
              activeTab === 'terminal'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('terminal')}
            data-testid="tab-terminal"
          >
            <Terminal className="size-3.5" />
            Terminal
          </button>
          {effectiveDir && (
            <button
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
                activeTab === 'review'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('review')}
              data-testid="tab-review"
            >
              <Code2 className="size-3.5" />
              Review
            </button>
          )}
        </div>
      )}

      {/* Content area */}
      {activeTab === 'review' && effectiveDir ? (
        <ReviewPanel directory={effectiveDir} />
      ) : sessionActive ? (
        <TerminalPanel taskId={task.id} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 animate-fade-in-up-delay-2">
            <div className="flex items-center justify-center size-12 rounded-xl bg-muted/40 border border-border/40">
              <Terminal className="size-5 text-muted-foreground/25" />
            </div>
            <p
              className="text-sm text-muted-foreground/40"
              data-testid="no-active-session"
            >
              No active session
            </p>
            {effectiveDir && (
              <p className="text-xs text-muted-foreground/30">
                Click Start Session to launch Claude Code
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
