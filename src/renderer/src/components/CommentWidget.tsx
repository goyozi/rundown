import React from 'react'
import { MessageSquare, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCommentStore } from '@/store/comment-store'

interface CommentWidgetProps {
  taskId: string
  commentId: string
  body: string
  autoFocus?: boolean
}

export function CommentWidget({
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
