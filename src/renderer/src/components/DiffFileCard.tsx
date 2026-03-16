import React from 'react'
import { Diff, Hunk } from 'react-diff-view'
import type { FileData, HunkData, DiffType, ChangeData } from 'react-diff-view'
import type { tokenize } from 'react-diff-view'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { fileIcon, fileStats } from '@/lib/diff-utils'

interface DiffFileCardProps {
  file: FileData
  filePath: string
  isCollapsed: boolean
  tokens: ReturnType<typeof tokenize> | undefined
  widgets: Record<string, React.ReactNode>
  fileComments: { id: string }[]
  onToggleCollapse: (filePath: string) => void
  onAddComment: (filePath: string, change: ChangeData) => void
}

export function DiffFileCard({
  file,
  filePath,
  isCollapsed,
  tokens,
  widgets,
  fileComments,
  onToggleCollapse,
  onAddComment
}: DiffFileCardProps): React.ReactElement {
  const fStats = fileStats(file)
  const fileCommentCount = fileComments.length

  return (
    <div
      className="rounded-lg border border-border/50 overflow-hidden bg-card/50"
      data-testid={`diff-file-${filePath}`}
    >
      {/* File header */}
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => onToggleCollapse(filePath)}
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
            tokens={tokens}
            widgets={widgets}
            gutterEvents={{
              onClick: ({ change }) => {
                if (change) onAddComment(filePath, change)
              }
            }}
          >
            {(hunks: HunkData[]) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        </div>
      )}
    </div>
  )
}
