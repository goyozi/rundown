import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  parseDiff,
  Diff,
  Hunk,
  tokenize,
  markEdits,
  getChangeKey,
  isInsert,
  isDelete,
  isNormal
} from 'react-diff-view'
import type { FileData, HunkData, DiffType, ChangeData } from 'react-diff-view'
import refractor from 'refractor'
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
  GitCommitHorizontal,
  Send,
  X,
  MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useCommentStore } from '@/store/comment-store'

type DiffMode = 'uncommitted' | 'branch'

interface DiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'docker',
  makefile: 'makefile'
}

function detectLanguage(filePath: string): string | undefined {
  const name = filePath.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'docker'
  if (name === 'makefile') return 'makefile'
  const ext = name.split('.').pop() ?? ''
  const lang = EXT_TO_LANG[ext]
  if (!lang) return undefined
  // Verify refractor has the grammar loaded
  try {
    refractor.highlight('', lang)
    return lang
  } catch {
    return undefined
  }
}

function tokenizeFile(file: FileData): ReturnType<typeof tokenize> | undefined {
  const filePath = file.newPath || file.oldPath
  const language = detectLanguage(filePath)
  if (!language) return undefined
  try {
    return tokenize(file.hunks as HunkData[], {
      highlight: true,
      refractor,
      language,
      enhancers: [markEdits(file.hunks as HunkData[])]
    })
  } catch {
    return undefined
  }
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

function getLineNumber(change: ChangeData): number {
  if (isNormal(change)) return change.newLineNumber
  return change.lineNumber
}

interface CommentWidgetProps {
  taskId: string
  commentId: string
  body: string
  autoFocus?: boolean
}

function CommentWidget({
  taskId,
  commentId,
  body,
  autoFocus
}: CommentWidgetProps): React.ReactElement {
  const { updateComment, removeComment } = useCommentStore()

  return (
    <div className="flex gap-2 items-start px-3 py-2" data-testid={`comment-widget-${commentId}`}>
      <MessageSquare className="size-3.5 text-primary/60 mt-1.5 shrink-0" />
      <textarea
        className="flex-1 min-h-[60px] text-xs bg-background/80 border border-border/60 rounded-md px-2.5 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring font-sans"
        placeholder="Write your review comment..."
        value={body}
        onChange={(e) => updateComment(taskId, commentId, e.target.value)}
        autoFocus={autoFocus}
        data-testid={`comment-textarea-${commentId}`}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="mt-1 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50 hover:text-destructive transition-colors"
            onClick={() => removeComment(taskId, commentId)}
            data-testid={`comment-remove-${commentId}`}
          >
            <X className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove comment</TooltipContent>
      </Tooltip>
    </div>
  )
}

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

  const fetchBranchInfo = useCallback(async () => {
    const result = await window.api.detectBranch(directory)
    if (!result.error) {
      setBranchInfo({ current: result.current, mainBranch: result.mainBranch, directory })
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
    setBranchInfo(null)
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

  const tokensByFile = useMemo(() => {
    const map = new Map<string, ReturnType<typeof tokenize>>()
    for (const file of files) {
      const filePath = file.newPath || file.oldPath
      const tokens = tokenizeFile(file)
      if (tokens) map.set(filePath, tokens)
    }
    return map
  }, [files])

  const visibleFilePaths = useMemo(() => new Set(files.map((f) => f.newPath || f.oldPath)), [files])

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

    // Serialize comments into feedback format
    const lines: string[] = ['Here is my review feedback on the current changes:', '']

    // Group comments by file
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
    await window.api.ptyWrite(taskId, feedbackText + '\n')

    clearComments(taskId)
    onSubmitted?.()
  }

  const isOnMainBranch = branchInfo?.current === branchInfo?.mainBranch
  const branchModeDisabled = !branchInfo?.mainBranch || isOnMainBranch

  // Auto-fallback: if branch mode is disabled but currently selected, switch to uncommitted.
  // Only act on fresh branchInfo (matching current directory) to avoid stale data from a previous task.
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
              const fileComments = comments.filter((c) => c.filePath === filePath)
              const fileCommentCount = fileComments.length

              // Build widgets map for this file
              const widgets: Record<string, React.ReactNode> = {}
              for (const comment of fileComments) {
                widgets[comment.changeKey] = (
                  <CommentWidget
                    key={comment.id}
                    taskId={taskId}
                    commentId={comment.id}
                    body={comment.body}
                  />
                )
              }

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
                    {fileCommentCount > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono px-1 py-0 h-4 gap-0.5 border-primary/30 text-primary"
                      >
                        <MessageSquare className="size-2.5" />
                        {fileCommentCount}
                      </Badge>
                    )}
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
                        tokens={tokensByFile.get(filePath)}
                        widgets={widgets}
                        gutterEvents={{
                          onClick: ({ change }) => {
                            if (change) handleAddComment(filePath, change)
                          }
                        }}
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
