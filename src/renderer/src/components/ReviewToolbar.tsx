import React from 'react'
import { RefreshCw, GitBranch, GitCommitHorizontal, Plus, Minus, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DiffStats } from '@/lib/diff-utils'

type DiffMode = 'uncommitted' | 'branch'

interface ReviewToolbarProps {
  mode: DiffMode
  onModeChange: (mode: DiffMode) => void
  branchInfo: { current: string; mainBranch: string | null } | null
  isOnMainBranch: boolean
  branchModeDisabled: boolean
  filesCount: number
  stats: DiffStats
  commentCount: number
  loading: boolean
  onRefresh: () => void
}

export function ReviewToolbar({
  mode,
  onModeChange,
  branchInfo,
  isOnMainBranch,
  branchModeDisabled,
  filesCount,
  stats,
  commentCount,
  loading,
  onRefresh
}: ReviewToolbarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
      {/* Mode toggle */}
      <div className="flex items-center rounded-md border border-border/60 bg-background/50 p-0.5">
        <button
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
            mode === 'uncommitted'
              ? 'bg-primary/10 text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onModeChange('uncommitted')}
          data-testid="mode-uncommitted"
        >
          <GitCommitHorizontal className="size-3" />
          Uncommitted
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
                mode === 'branch'
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                branchModeDisabled && 'opacity-40 cursor-not-allowed'
              )}
              onClick={() => !branchModeDisabled && onModeChange('branch')}
              disabled={branchModeDisabled}
              data-testid="mode-branch"
            >
              <GitBranch className="size-3" />
              Branch vs. Main
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {!branchInfo?.mainBranch
              ? 'No main/master branch detected'
              : isOnMainBranch
                ? 'Already on the main branch'
                : `Compare ${branchInfo.current} against ${branchInfo.mainBranch}`}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Branch info */}
      {branchInfo && (
        <span className="text-[11px] text-muted-foreground/50 font-mono" data-testid="branch-info">
          {branchInfo.current}
          {mode === 'branch' && branchInfo.mainBranch && (
            <span className="text-muted-foreground/30"> ← {branchInfo.mainBranch}</span>
          )}
        </span>
      )}

      <div className="flex-1" />

      {/* Summary stats */}
      {filesCount > 0 && (
        <div
          className="flex items-center gap-3 text-[11px] text-muted-foreground"
          data-testid="diff-summary"
        >
          <span>
            <span className="font-medium text-foreground">{stats.filesChanged}</span>{' '}
            {stats.filesChanged === 1 ? 'file' : 'files'}
          </span>
          <span className="flex items-center gap-0.5 text-success">
            <Plus className="size-3" />
            {stats.additions}
          </span>
          <span className="flex items-center gap-0.5 text-destructive">
            <Minus className="size-3" />
            {stats.deletions}
          </span>
        </div>
      )}

      {/* Comment count badge */}
      {commentCount > 0 && (
        <Badge
          variant="outline"
          className="text-[10px] font-mono px-1.5 py-0 h-5 gap-1 border-primary/30 text-primary"
          data-testid="comment-count-badge"
        >
          <MessageSquare className="size-3" />
          {commentCount}
        </Badge>
      )}

      {/* Refresh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRefresh}
            disabled={loading}
            data-testid="refresh-diff"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh diff</TooltipContent>
      </Tooltip>
    </div>
  )
}
