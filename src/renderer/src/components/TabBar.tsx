import React from 'react'
import { Terminal, Code2, BotMessageSquare, Plus, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DetailTab, ShellTab } from '@/store/slices/shell-tab-slice'

interface TabBarProps {
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  shellTabs: ShellTab[]
  effectiveDir: string | undefined
  sessionActive: boolean
  onAddShellTab: () => void
  onCloseShellTab: (shellTab: ShellTab) => void
}

export function TabBar({
  activeTab,
  onTabChange,
  shellTabs,
  effectiveDir,
  sessionActive,
  onAddShellTab,
  onCloseShellTab
}: TabBarProps): React.ReactElement | null {
  if (!sessionActive && !effectiveDir) return null

  return (
    <div className="flex items-center border-b border-border/50 bg-muted/10 px-4">
      <button
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
          activeTab === 'claude'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )}
        onClick={() => onTabChange('claude')}
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
          onClick={() => onTabChange('review')}
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
            onClick={() => onTabChange(`shell:${shellTab.id}`)}
            data-testid={`tab-${shellTab.id}`}
          >
            <Terminal className="size-3.5" />
            {shellTab.label}
          </button>
          <button
            className="p-0.5 mr-1 rounded opacity-0 group-hover/tab:opacity-100 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
            onClick={() => onCloseShellTab(shellTab)}
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
              onClick={onAddShellTab}
              data-testid="add-shell-tab"
            >
              <Plus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open a shell terminal</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
