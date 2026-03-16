import { useState, useRef, useEffect } from 'react'
import { Plus, ChevronDown, Trash2, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'

interface GroupSelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleteGroup: (groupId: string) => void
}

export function GroupSelector({
  open,
  onOpenChange,
  onDeleteGroup
}: GroupSelectorProps): React.JSX.Element {
  const { groups, activeGroupId, getActiveGroup, getGroupTaskCount, setActiveGroup, addGroup } =
    useTaskStore(
      useShallow((s) => ({
        groups: s.groups,
        activeGroupId: s.activeGroupId,
        getActiveGroup: s.getActiveGroup,
        getGroupTaskCount: s.getGroupTaskCount,
        setActiveGroup: s.setActiveGroup,
        addGroup: s.addGroup
      }))
    )

  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const newGroupInputRef = useRef<HTMLInputElement>(null)
  const activeGroup = getActiveGroup()

  useEffect(() => {
    if (isCreatingGroup && newGroupInputRef.current) {
      newGroupInputRef.current.focus()
    }
  }, [isCreatingGroup])

  const handleCreateGroup = (): void => {
    const trimmed = newGroupName.trim()
    if (trimmed) {
      addGroup(trimmed)
      setNewGroupName('')
      setIsCreatingGroup(false)
      onOpenChange(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-sm font-semibold tracking-tight hover:text-primary/80 transition-colors cursor-pointer rounded-sm px-1 -mx-1 py-0.5 hover:bg-muted/60"
          data-testid="group-selector-trigger"
        >
          <span className="truncate max-w-[140px]">{activeGroup?.name ?? 'Rundown'}</span>
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-0"
        data-testid="group-selector-dropdown"
      >
        <div className="py-1.5">
          <div className="px-3 py-1.5">
            <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              Groups
            </p>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {groups.map((group) => {
              const isActive = group.id === activeGroupId
              const taskCount = getGroupTaskCount(group.id)
              const isLastGroup = groups.length <= 1
              return (
                <div
                  key={group.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/60 text-foreground'
                  }`}
                  onClick={() => {
                    setActiveGroup(group.id)
                    onOpenChange(false)
                  }}
                  data-testid={`group-item-${group.id}`}
                >
                  <span className="text-sm truncate flex-1">{group.name}</span>
                  <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
                    {taskCount}
                  </span>
                  {!isLastGroup && (
                    <button
                      className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteGroup(group.id)
                      }}
                      data-testid={`delete-group-${group.id}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <Separator className="my-1.5 opacity-60" />

          {isCreatingGroup ? (
            <div className="px-3 py-1.5">
              <div className="flex gap-1.5">
                <Input
                  ref={newGroupInputRef}
                  placeholder="Group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateGroup()
                    if (e.key === 'Escape') {
                      setIsCreatingGroup(false)
                      setNewGroupName('')
                    }
                  }}
                  className="h-7 text-sm"
                  data-testid="new-group-input"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 size-7"
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim()}
                  data-testid="confirm-new-group"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              onClick={() => setIsCreatingGroup(true)}
              data-testid="new-group-button"
            >
              <FolderPlus className="size-3.5" />
              <span>New Group</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
