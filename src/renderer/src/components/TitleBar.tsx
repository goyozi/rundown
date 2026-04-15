import { Search } from 'lucide-react'
import { ShortcutBar } from './ShortcutBar'
import { NavButtons } from './NavButtons'

interface TitleBarProps {
  onGoToTask: () => void
}

export function TitleBar({ onGoToTask }: TitleBarProps): React.JSX.Element {
  return (
    <div className="h-9 flex items-center justify-center bg-sidebar-bg border-b border-border drag-region shrink-0 pl-[80px] relative">
      <div className="absolute left-[90px] top-1/2 -translate-y-1/2">
        <NavButtons />
      </div>
      <button
        onClick={onGoToTask}
        className="no-drag flex items-center justify-between w-full max-w-[600px] mx-4 px-2.5 py-1 rounded-md bg-background/60 border border-border text-xs cursor-pointer hover:bg-background/80 transition-colors z-10"
        data-testid="go-to-task-trigger"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Search className="size-3" />
          Go to... / Run...
        </span>
        <kbd className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
          ⌘P
        </kbd>
      </button>
      <div className="absolute right-4">
        <ShortcutBar />
      </div>
    </div>
  )
}
