import React from 'react'
import {
  FolderOpen,
  CheckCircle2,
  Play,
  Square,
  Loader2,
  GitBranch,
  GitFork,
  Trash2,
  X
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Task } from '@/store/task-store'
import type { WorktreeMode } from '../../../shared/types'

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
  worktreeMode?: WorktreeMode
  resolvedMode?: 'own-worktree' | 'no-worktree'
  isLocked?: boolean
  effectiveWorktreeName?: string
  isWorktreeOwner?: boolean
  inheritedWorktreeName?: string
  onModeChange?: (mode: WorktreeMode) => void
  onCreateWorktree?: () => void
  onDeleteWorktree?: () => void
  onClearNoWorktreeLock?: () => void
  onLockNoWorktree?: () => void
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
  onStopSession,
  worktreeMode,
  resolvedMode,
  isLocked,
  effectiveWorktreeName,
  isWorktreeOwner,
  inheritedWorktreeName,
  onModeChange,
  onCreateWorktree,
  onDeleteWorktree,
  onClearNoWorktreeLock,
  onLockNoWorktree
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

  const hasRepo = !!effectiveDir
  const currentMode = worktreeMode ?? 'inherit'

  // Determine worktree display state
  const showModeSelector = hasRepo && !isLocked
  const showLockedOwner = isLocked && isWorktreeOwner && effectiveWorktreeName
  const showLockedInherited = isLocked && !isWorktreeOwner && effectiveWorktreeName
  const showLockedNoWorktree = isLocked && !effectiveWorktreeName && resolvedMode === 'no-worktree'

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

            {/* Worktree mode selector (unlocked + has repo) */}
            {showModeSelector && onModeChange && (
              <div className="flex items-center gap-1.5 mt-1.5 animate-fade-in-up-delay">
                <GitFork className="size-3.5 shrink-0 text-muted-foreground/50" />
                <Select value={currentMode} onValueChange={(v) => onModeChange(v as WorktreeMode)}>
                  <SelectTrigger
                    className="!h-auto !min-h-0 !border-none !shadow-none !bg-muted/50 hover:!bg-muted !px-1.5 !py-0.5 !rounded !gap-0.5 !text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono [&_svg]:!size-3 [&_svg]:text-muted-foreground/50"
                    data-testid="worktree-mode-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit" className="text-xs">
                      Inherit
                    </SelectItem>
                    <SelectItem value="own-worktree" className="text-xs">
                      Own worktree
                    </SelectItem>
                    <SelectItem value="no-worktree" className="text-xs">
                      No worktree
                    </SelectItem>
                  </SelectContent>
                </Select>
                {currentMode === 'inherit' && inheritedWorktreeName && (
                  <code
                    className="font-mono text-[11px] bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded"
                    data-testid="worktree-name"
                  >
                    {inheritedWorktreeName}
                  </code>
                )}
                {currentMode === 'inherit' && !inheritedWorktreeName && resolvedMode && (
                  <span
                    className="text-[11px] text-muted-foreground/40 italic"
                    data-testid="resolved-mode-hint"
                  >
                    {resolvedMode === 'own-worktree' ? 'own worktree' : 'no worktree'}
                  </span>
                )}
                {currentMode === 'own-worktree' && !effectiveWorktreeName && onCreateWorktree && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 text-[11px] px-1.5 rounded"
                    onClick={onCreateWorktree}
                    data-testid="create-worktree-btn"
                  >
                    Create
                  </Button>
                )}
                {currentMode === 'no-worktree' && onLockNoWorktree && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 text-[11px] px-1.5 rounded"
                    onClick={onLockNoWorktree}
                    data-testid="lock-no-worktree-btn"
                  >
                    Lock
                  </Button>
                )}
              </div>
            )}

            {/* Locked: owns worktree */}
            {showLockedOwner && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay mt-1.5">
                <GitBranch className="size-3.5 shrink-0 text-primary/50" />
                <code
                  className="font-mono text-[11px] bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded"
                  data-testid="worktree-name"
                >
                  {effectiveWorktreeName}
                </code>
                {onDeleteWorktree && !sessionActive && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground/50 hover:text-destructive"
                        onClick={onDeleteWorktree}
                        data-testid="delete-worktree-btn"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete worktree</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* Locked: inherits worktree */}
            {showLockedInherited && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay mt-1.5">
                <GitBranch className="size-3.5 shrink-0 text-primary/50" />
                <code
                  className="font-mono text-[11px] bg-primary/5 text-primary/80 px-1.5 py-0.5 rounded"
                  data-testid="worktree-name"
                >
                  {effectiveWorktreeName}
                </code>
                <span
                  className="italic text-muted-foreground/40 text-[11px]"
                  data-testid="worktree-inherited"
                >
                  inherited
                </span>
              </div>
            )}

            {/* Locked: no worktree */}
            {showLockedNoWorktree && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in-up-delay mt-1.5">
                <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/50" />
                <span className="font-mono text-[11px] bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded">
                  No worktree
                </span>
                {onClearNoWorktreeLock && !sessionActive && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground/50 hover:text-destructive"
                        onClick={onClearNoWorktreeLock}
                        data-testid="clear-no-worktree-lock-btn"
                      >
                        <X className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Clear lock</TooltipContent>
                  </Tooltip>
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
