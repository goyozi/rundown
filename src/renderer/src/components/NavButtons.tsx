import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function NavButtons(): React.JSX.Element {
  const goBack = useTaskStore((s) => s.goBack)
  const goForward = useTaskStore((s) => s.goForward)
  const canGoBack = useTaskStore((s) => s.canGoBack())
  const canGoForward = useTaskStore((s) => s.canGoForward())

  return (
    <div className="no-drag flex items-center gap-0.5 shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="size-6 flex items-center justify-center rounded text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-25 disabled:cursor-default"
            data-testid="nav-back"
          >
            <ChevronLeft className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Back (⌘[)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={goForward}
            disabled={!canGoForward}
            className="size-6 flex items-center justify-center rounded text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-25 disabled:cursor-default"
            data-testid="nav-forward"
          >
            <ChevronRight className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Forward (⌘])</TooltipContent>
      </Tooltip>
    </div>
  )
}
