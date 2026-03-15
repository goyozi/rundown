import React, { useState, useCallback, useEffect } from 'react'
import {
  FolderOpen,
  Terminal,
  CheckCircle2,
  ListTodo,
  AlertCircle,
  Play,
  Square,
  Loader2,
  Code2,
  BotMessageSquare,
  Plus,
  X
} from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { useTheme } from '@/hooks/use-theme'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { TerminalPanel } from './TerminalPanel'
import { ReviewPanel } from './ReviewPanel'
import { cn } from '@/lib/utils'

type DetailTab = 'claude' | 'review' | `shell:${string}`
type DiffMode = 'uncommitted' | 'branch'

interface ShellTab {
  id: string
  label: string
  sessionId: string
}

let shellCounter = 0

export function TaskDetail(): React.JSX.Element | null {
  const {
    selectedTaskId,
    getTask,
    getEffectiveDirectory,
    updateDirectory,
    activeSessions,
    startSession,
    stopSession
  } = useTaskStore()
  const { resolved } = useTheme()
  const [dirError, setDirError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [tabPerTask, setTabPerTask] = useState<Record<string, DetailTab>>({})
  const [modePerTask, setModePerTask] = useState<Record<string, DiffMode>>({})
  const [shellTabsPerTask, setShellTabsPerTask] = useState<Record<string, ShellTab[]>>({})

  const activeTab = (selectedTaskId && tabPerTask[selectedTaskId]) || 'claude'
  const setActiveTab = (tab: DetailTab): void => {
    if (selectedTaskId) {
      setTabPerTask((prev) => ({ ...prev, [selectedTaskId]: tab }))
    }
  }
  const shellTabs = (selectedTaskId && shellTabsPerTask[selectedTaskId]) || []

  const diffMode: DiffMode = (selectedTaskId && modePerTask[selectedTaskId]) || 'uncommitted'
  const setDiffMode = useCallback(
    (mode: DiffMode): void => {
      if (selectedTaskId) {
        setModePerTask((prev) => ({ ...prev, [selectedTaskId]: mode }))
      }
    },
    [selectedTaskId]
  )

  // Clean up shell tab when its PTY process exits naturally (e.g. user types `exit`)
  useEffect(() => {
    const cleanup = window.api.onPtyExit((exitedSessionId) => {
      // Shell session IDs are formatted as "taskId:shell-N"
      if (!exitedSessionId.includes(':shell-')) return

      setShellTabsPerTask((prev) => {
        const updated = { ...prev }
        for (const [taskId, tabs] of Object.entries(updated)) {
          const match = tabs.find((t) => t.sessionId === exitedSessionId)
          if (match) {
            updated[taskId] = tabs.filter((t) => t.id !== match.id)
            break
          }
        }
        return updated
      })

      // Switch away from the closed tab if it was active
      setTabPerTask((prev) => {
        const updated = { ...prev }
        for (const [taskId, tab] of Object.entries(updated)) {
          if (typeof tab === 'string' && tab.startsWith('shell:')) {
            const shellId = tab.slice('shell:'.length)
            if (exitedSessionId.endsWith(`:${shellId}`)) {
              updated[taskId] = 'claude'
              break
            }
          }
        }
        return updated
      })
    })
    return cleanup
  }, [])

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

  const handlePickDirectory = async (): Promise<void> => {
    if (sessionActive) return
    const dir = await window.api.openDirectory()
    if (dir) {
      const result = await window.api.validateRepo(dir)
      if (result.valid) {
        setDirError(null)
        updateDirectory(task.id, dir)
      } else {
        setDirError(result.error ?? 'Invalid directory')
      }
    }
  }

  const handleStartSession = async (): Promise<void> => {
    if (!effectiveDir || isStarting) return
    setIsStarting(true)
    try {
      const result = await window.api.ptySpawn(task.id, effectiveDir, resolved)
      if (result.success) {
        startSession(task.id)
      }
    } finally {
      setIsStarting(false)
    }
  }

  const handleStopSession = async (): Promise<void> => {
    await window.api.ptyKill(task.id)
    stopSession(task.id)
  }

  const handleAddShellTab = async (): Promise<void> => {
    if (!effectiveDir || !selectedTaskId) return
    shellCounter++
    const id = `shell-${shellCounter}`
    const sessionId = `${selectedTaskId}:${id}`
    const num = shellTabs.length + 1
    const tab: ShellTab = { id, label: `Shell ${num}`, sessionId }

    setShellTabsPerTask((prev) => ({
      ...prev,
      [selectedTaskId]: [...(prev[selectedTaskId] || []), tab]
    }))
    setActiveTab(`shell:${id}`)

    await window.api.ptySpawnShell(sessionId, effectiveDir, resolved)
  }

  const handleCloseShellTab = async (shellTab: ShellTab): Promise<void> => {
    if (!selectedTaskId) return
    await window.api.ptyKill(shellTab.sessionId)

    setShellTabsPerTask((prev) => ({
      ...prev,
      [selectedTaskId]: (prev[selectedTaskId] || []).filter((t) => t.id !== shellTab.id)
    }))

    // Switch away if this was the active tab
    if (activeTab === `shell:${shellTab.id}`) {
      setActiveTab('claude')
    }
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
                      onClick={handlePickDirectory}
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
                    onClick={handlePickDirectory}
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
              activeTab === 'claude'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('claude')}
            data-testid="tab-terminal"
          >
            <BotMessageSquare className="size-3.5" />
            Claude
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
          {shellTabs.map((shellTab) => (
            <div
              key={shellTab.id}
              className={cn(
                'group/tab flex items-center -mb-px border-b-2 transition-colors',
                activeTab === `shell:${shellTab.id}`
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <button
                className="flex items-center gap-1.5 pl-3 pr-1 py-2 text-xs font-medium"
                onClick={() => setActiveTab(`shell:${shellTab.id}`)}
                data-testid={`tab-${shellTab.id}`}
              >
                <Terminal className="size-3.5" />
                {shellTab.label}
              </button>
              <button
                className="p-0.5 mr-1 rounded opacity-0 group-hover/tab:opacity-100 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
                onClick={() => handleCloseShellTab(shellTab)}
                data-testid={`close-${shellTab.id}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {effectiveDir && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex items-center justify-center size-6 ml-1 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-colors"
                  onClick={handleAddShellTab}
                  data-testid="add-shell-tab"
                >
                  <Plus className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Open a shell terminal</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* Content area */}
      {activeTab === 'review' && effectiveDir ? (
        <ReviewPanel
          directory={effectiveDir}
          taskId={task.id}
          sessionActive={sessionActive}
          mode={diffMode}
          onModeChange={setDiffMode}
          onSubmitted={() => setActiveTab('claude')}
        />
      ) : activeTab.startsWith('shell:') ? (
        (() => {
          const shellId = activeTab.slice('shell:'.length)
          const shellTab = shellTabs.find((t) => t.id === shellId)
          return shellTab ? (
            <TerminalPanel key={shellTab.sessionId} sessionId={shellTab.sessionId} />
          ) : null
        })()
      ) : sessionActive ? (
        <TerminalPanel sessionId={task.id} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 animate-fade-in-up-delay-2">
            <div className="flex items-center justify-center size-12 rounded-xl bg-muted/40 border border-border/40">
              <BotMessageSquare className="size-5 text-muted-foreground/25" />
            </div>
            <p className="text-sm text-muted-foreground/40" data-testid="no-active-session">
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

      {/* Directory validation error dialog */}
      <Dialog open={!!dirError} onOpenChange={(open) => !open && setDirError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Invalid directory
            </DialogTitle>
            <DialogDescription data-testid="directory-error">{dirError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDirError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
