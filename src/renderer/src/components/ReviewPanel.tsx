import React, { useState, useEffect, useMemo, useRef } from 'react'
import { parseDiff, getChangeKey } from 'react-diff-view'
import type { FileData, ChangeData } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import { FileDiff, Loader2, AlertCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCommentStore } from '@/store/comment-store'
import { resolveFilePath, computeStats, tokenizeFile, getLineNumber } from '@/lib/diff-utils'
import type { DiffMode } from '../../../shared/types'
import { CommentWidget } from './CommentWidget'
import { DiffFileCard } from './DiffFileCard'
import { ReviewToolbar } from './ReviewToolbar'

interface ReviewPanelProps {
  directory: string
  taskId: string
  sessionActive: boolean
  mode: DiffMode
  onModeChange: (mode: DiffMode) => void
  onSubmitted?: () => void
}

export function ReviewPanel({
  directory,
  taskId,
  sessionActive,
  mode,
  onModeChange,
  onSubmitted
}: ReviewPanelProps): React.ReactElement {
  const [diffText, setDiffText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [branchInfo, setBranchInfo] = useState<{
    current: string
    mainBranch: string | null
    directory: string
  } | null>(null)

  const taskComments = useCommentStore((s) => s.pool[taskId])
  const addComment = useCommentStore((s) => s.addComment)
  const clearComments = useCommentStore((s) => s.clearComments)
  const comments = useMemo(() => taskComments ?? [], [taskComments])
  const commentCount = comments.length

  const refreshRef = useRef<(() => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      setBranchInfo(null)

      try {
        const info = await window.api.detectBranch(directory)
        if (cancelled) return
        if (!info.error) {
          setBranchInfo({ current: info.current, mainBranch: info.mainBranch, directory })
        }

        if (mode === 'uncommitted') {
          const result = await window.api.diffUncommitted(directory)
          if (cancelled) return
          if (result.error) setError(result.error)
          else setDiffText(result.diff)
        } else {
          if (!info.mainBranch) {
            setError('No main or master branch detected')
            setDiffText('')
            return
          }
          const result = await window.api.diffBranch(directory, info.mainBranch)
          if (cancelled) return
          if (result.error) setError(result.error)
          else setDiffText(result.diff)
        }
      } catch {
        if (!cancelled) setError('Failed to fetch diff')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    refreshRef.current = run
    run()
    return () => {
      cancelled = true
    }
  }, [directory, mode])

  const files = useMemo<FileData[]>(() => {
    if (!diffText) return []
    try {
      return parseDiff(diffText)
    } catch {
      return []
    }
  }, [diffText])

  const stats = useMemo(() => computeStats(files), [files])

  const tokensByFile = useMemo(() => {
    const map = new Map<string, ReturnType<typeof import('react-diff-view').tokenize>>()
    for (const file of files) {
      const fp = resolveFilePath(file)
      const tokens = tokenizeFile(file)
      if (tokens) map.set(fp, tokens)
    }
    return map
  }, [files])

  const visibleFilePaths = useMemo(() => new Set(files.map((f) => resolveFilePath(f))), [files])

  const hiddenCommentCount = useMemo(
    () => comments.filter((c) => !visibleFilePaths.has(c.filePath)).length,
    [comments, visibleFilePaths]
  )

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

  const handleAddComment = (filePath: string, change: ChangeData): void => {
    const changeKey = getChangeKey(change)
    const lineNumber = getLineNumber(change)
    addComment(taskId, filePath, changeKey, lineNumber)
  }

  const handleSubmitToClaude = async (): Promise<void> => {
    if (commentCount === 0 || !sessionActive) return

    const lines: string[] = ['Here is my review feedback on the current changes:', '']

    const byFile = new Map<string, typeof comments>()
    for (const comment of comments) {
      const existing = byFile.get(comment.filePath) ?? []
      existing.push(comment)
      byFile.set(comment.filePath, existing)
    }

    for (const [filePath, fileComments] of byFile) {
      for (const comment of fileComments) {
        if (!comment.body.trim()) continue
        lines.push(`## ${filePath} (line ${comment.lineNumber})`)
        lines.push(comment.body.trim())
        lines.push('')
      }
    }

    const feedbackText = lines.join('\n')
    // Short delay so the terminal has time to render before input arrives
    await new Promise((resolve) => setTimeout(resolve, 500))
    await window.api.ptyWrite(taskId, feedbackText + '\n')

    clearComments(taskId)
    onSubmitted?.()
  }

  const isOnMainBranch = branchInfo?.current === branchInfo?.mainBranch
  const branchModeDisabled = !branchInfo?.mainBranch || isOnMainBranch

  useEffect(() => {
    if (
      branchInfo &&
      branchInfo.directory === directory &&
      branchModeDisabled &&
      mode === 'branch'
    ) {
      onModeChange('uncommitted')
    }
  }, [branchInfo, branchModeDisabled, mode, onModeChange, directory])

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="review-panel">
      <ReviewToolbar
        mode={mode}
        onModeChange={onModeChange}
        branchInfo={branchInfo}
        isOnMainBranch={isOnMainBranch}
        branchModeDisabled={branchModeDisabled}
        filesCount={files.length}
        stats={stats}
        commentCount={commentCount}
        loading={loading}
        onRefresh={() => refreshRef.current?.()}
      />

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
              const filePath = resolveFilePath(file)
              const fileComments = comments.filter((c) => c.filePath === filePath)

              const widgets: Record<string, React.ReactNode> = {}
              for (const comment of fileComments) {
                widgets[comment.changeKey] = (
                  <CommentWidget
                    key={comment.id}
                    taskId={taskId}
                    commentId={comment.id}
                    body={comment.body}
                    autoFocus
                  />
                )
              }

              return (
                <DiffFileCard
                  key={filePath}
                  file={file}
                  filePath={filePath}
                  isCollapsed={collapsedFiles.has(filePath)}
                  tokens={tokensByFile.get(filePath)}
                  widgets={widgets}
                  fileComments={fileComments}
                  onToggleCollapse={toggleCollapse}
                  onAddComment={handleAddComment}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Submit footer */}
      {commentCount > 0 && (
        <div
          className="shrink-0 border-t border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-3"
          data-testid="submit-footer"
        >
          <div className="flex-1 text-xs text-muted-foreground">
            {hiddenCommentCount > 0 ? (
              <span data-testid="hidden-comment-info">
                All {commentCount} {commentCount === 1 ? 'comment' : 'comments'} will be submitted (
                {hiddenCommentCount} hidden in current view).
              </span>
            ) : (
              <span>
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'} ready to submit
              </span>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={handleSubmitToClaude}
                disabled={!sessionActive}
                data-testid="submit-to-claude"
              >
                <Send className="size-3.5 mr-1.5" />
                Submit to Claude
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {sessionActive
                ? 'Send all review comments to the active Claude session'
                : 'Start a session first to submit feedback'}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
