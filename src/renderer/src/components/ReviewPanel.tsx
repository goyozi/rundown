import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { parseDiff, Diff, Hunk, isInsert, isDelete } from 'react-diff-view'
import type { FileData, HunkData, DiffType } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  FileX2,
  FileDiff,
  Plus,
  Minus,
  AlertCircle,
  Loader2,
  GitBranch,
  GitCommitHorizontal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type DiffMode = 'uncommitted' | 'branch'

interface DiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

function computeStats(files: FileData[]): DiffStats {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (isInsert(change)) additions++
        if (isDelete(change)) deletions++
      }
    }
  }
  return { filesChanged: files.length, additions, deletions }
}

function fileIcon(type: string): React.ReactElement {
  switch (type) {
    case 'add':
      return <FilePlus2 className="size-3.5 text-success shrink-0" />
    case 'delete':
      return <FileX2 className="size-3.5 text-destructive shrink-0" />
    case 'rename':
      return <FileDiff className="size-3.5 text-chart-2 shrink-0" />
    default:
      return <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
  }
}

function fileStats(file: FileData): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (isInsert(change)) adds++
      if (isDelete(change)) dels++
    }
  }
  return { adds, dels }
}

interface ReviewPanelProps {
  directory: string
}

export function ReviewPanel({ directory }: ReviewPanelProps): React.ReactElement {
  const [mode, setMode] = useState<DiffMode>('uncommitted')
  const [diffText, setDiffText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [branchInfo, setBranchInfo] = useState<{
    current: string
    mainBranch: string | null
  } | null>(null)

  const fetchBranchInfo = useCallback(async () => {
    const result = await window.api.detectBranch(directory)
    if (!result.error) {
      setBranchInfo({ current: result.current, mainBranch: result.mainBranch })
    }
    return result
  }, [directory])

  const fetchDiff = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'uncommitted') {
        const result = await window.api.diffUncommitted(directory)
        if (result.error) {
          setError(result.error)
        } else {
          setDiffText(result.diff)
        }
      } else {
        // Branch mode: need mainBranch
        let mainBranch = branchInfo?.mainBranch
        if (!mainBranch) {
          const info = await fetchBranchInfo()
          mainBranch = info.mainBranch
        }
        if (!mainBranch) {
          setError('No main or master branch detected')
          setDiffText('')
          return
        }
        const result = await window.api.diffBranch(directory, mainBranch)
        if (result.error) {
          setError(result.error)
        } else {
          setDiffText(result.diff)
        }
      }
    } catch {
      setError('Failed to fetch diff')
    } finally {
      setLoading(false)
    }
  }, [directory, mode, branchInfo, fetchBranchInfo])

  useEffect(() => {
    fetchBranchInfo()
  }, [fetchBranchInfo])

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  const files = useMemo<FileData[]>(() => {
    if (!diffText) return []
    try {
      return parseDiff(diffText)
    } catch {
      return []
    }
  }, [diffText])

  const stats = useMemo(() => computeStats(files), [files])

  const toggleCollapse = (filePath: string): void => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  const isOnMainBranch = branchInfo?.current === branchInfo?.mainBranch
  const branchModeDisabled = !branchInfo?.mainBranch || isOnMainBranch

  return (
    <div className="flex flex-col h-full" data-testid="review-panel">
      {/* Toolbar */}
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
            onClick={() => setMode('uncommitted')}
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
                onClick={() => !branchModeDisabled && setMode('branch')}
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
          <span
            className="text-[11px] text-muted-foreground/50 font-mono"
            data-testid="branch-info"
          >
            {branchInfo.current}
            {mode === 'branch' && branchInfo.mainBranch && (
              <span className="text-muted-foreground/30"> ← {branchInfo.mainBranch}</span>
            )}
          </span>
        )}

        <div className="flex-1" />

        {/* Summary stats */}
        {files.length > 0 && (
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

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={fetchDiff}
              disabled={loading}
              data-testid="refresh-diff"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh diff</TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      {loading && files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 animate-fade-in-up">
            <Loader2 className="size-5 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground/50">Loading diff...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 animate-fade-in-up">
            <AlertCircle className="size-5 text-destructive/60" />
            <p className="text-xs text-destructive/80">{error}</p>
          </div>
        </div>
      ) : files.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 animate-fade-in-up">
            <div className="flex items-center justify-center size-12 rounded-xl bg-muted/40 border border-border/40">
              <FileDiff className="size-5 text-muted-foreground/25" />
            </div>
            <p className="text-sm text-muted-foreground/40" data-testid="no-changes">
              No changes
            </p>
            <p className="text-xs text-muted-foreground/30">
              {mode === 'uncommitted'
                ? 'Working tree is clean'
                : 'No differences from the main branch'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-3" data-testid="diff-files">
            {files.map((file) => {
              const filePath = file.newPath || file.oldPath
              const isCollapsed = collapsedFiles.has(filePath)
              const fStats = fileStats(file)

              return (
                <div
                  key={filePath}
                  className="rounded-lg border border-border/50 overflow-hidden bg-card/50"
                  data-testid={`diff-file-${filePath}`}
                >
                  {/* File header */}
                  <button
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => toggleCollapse(filePath)}
                    data-testid={`file-header-${filePath}`}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
                    ) : (
                      <ChevronDown className="size-3.5 text-muted-foreground/50 shrink-0" />
                    )}
                    {fileIcon(file.type)}
                    <code className="text-xs font-mono truncate flex-1">{filePath}</code>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono px-1.5 py-0 h-5 gap-1.5 border-border/40"
                    >
                      {fStats.adds > 0 && <span className="text-success">+{fStats.adds}</span>}
                      {fStats.dels > 0 && <span className="text-destructive">-{fStats.dels}</span>}
                    </Badge>
                  </button>

                  {/* File diff */}
                  {!isCollapsed && (
                    <div className="diff-wrapper border-t border-border/30 overflow-x-auto text-xs">
                      <Diff
                        viewType="unified"
                        diffType={file.type as DiffType}
                        hunks={file.hunks as HunkData[]}
                      >
                        {(hunks: HunkData[]) =>
                          hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                        }
                      </Diff>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
