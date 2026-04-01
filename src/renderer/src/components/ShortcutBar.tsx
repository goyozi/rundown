import { useState, useCallback, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { icons } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { ShortcutDialog } from './ShortcutDialog'
import { executeShortcut } from '@/lib/execute-shortcut'
import type { Shortcut } from '../../../shared/types'

function SortableShortcutButton({
  shortcut,
  onEdit,
  onDelete
}: {
  shortcut: Shortcut
  onEdit: (s: Shortcut) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shortcut.id
  })
  const IconComponent = icons[shortcut.icon as keyof typeof icons]
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                className="no-drag size-[26px] flex items-center justify-center rounded-md bg-background/60 border border-border text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
                data-testid="shortcut-button"
                onClick={() => executeShortcut(shortcut)}
              >
                {IconComponent ? <IconComponent className="size-3.5" /> : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {shortcut.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-36">
        <ContextMenuItem data-testid="shortcut-context-edit" onClick={() => onEdit(shortcut)}>
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="shortcut-context-delete"
          className="text-destructive"
          onClick={() => onDelete(shortcut.id)}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ShortcutBar(): React.JSX.Element {
  const { shortcuts, addShortcut, updateShortcut, deleteShortcut, reorderShortcuts } = useTaskStore(
    useShallow((s) => ({
      shortcuts: s.shortcuts,
      addShortcut: s.addShortcut,
      updateShortcut: s.updateShortcut,
      deleteShortcut: s.deleteShortcut,
      reorderShortcuts: s.reorderShortcuts
    }))
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | undefined>()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sorted = useMemo(() => [...shortcuts].sort((a, b) => a.order - b.order), [shortcuts])
  const sortedIds = useMemo(() => sorted.map((s) => s.id), [sorted])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = sortedIds.indexOf(String(active.id))
      const newIndex = sortedIds.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = [...sortedIds]
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, String(active.id))
      reorderShortcuts(newOrder)
    },
    [sortedIds, reorderShortcuts]
  )

  const handleEdit = useCallback((shortcut: Shortcut) => {
    setEditingShortcut(shortcut)
    setDialogOpen(true)
  }, [])

  const handleAdd = useCallback(() => {
    setEditingShortcut(undefined)
    setDialogOpen(true)
  }, [])

  const handleSave = useCallback(
    (data: { name: string; icon: string; type: 'shell' | 'claude'; command: string }) => {
      if (editingShortcut) {
        updateShortcut(editingShortcut.id, data)
      } else {
        addShortcut(data)
      }
    },
    [editingShortcut, addShortcut, updateShortcut]
  )

  const activeShortcut = activeId ? sorted.find((s) => s.id === activeId) : null
  const ActiveIcon = activeShortcut ? icons[activeShortcut.icon as keyof typeof icons] : null

  const hasShortcuts = sorted.length > 0

  return (
    <>
      <div className="no-drag flex items-center gap-1">
        {/* + button */}
        {hasShortcuts ? (
          <button
            className="size-[26px] flex items-center justify-center rounded-md text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors cursor-pointer"
            data-testid="add-shortcut-icon-button"
            onClick={handleAdd}
            title="Add Shortcut"
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <button
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-primary/25 bg-primary/10 text-primary text-xs hover:bg-primary/15 transition-colors cursor-pointer"
            data-testid="add-shortcut-button"
            onClick={handleAdd}
          >
            <Plus className="size-3" />
            Add shortcut
          </button>
        )}

        {/* Shortcut buttons */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortedIds} strategy={horizontalListSortingStrategy}>
            {sorted.map((shortcut) => (
              <SortableShortcutButton
                key={shortcut.id}
                shortcut={shortcut}
                onEdit={handleEdit}
                onDelete={deleteShortcut}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeShortcut && ActiveIcon ? (
              <div className="size-[26px] flex items-center justify-center rounded-md bg-background border border-border text-foreground shadow-lg scale-105">
                <ActiveIcon className="size-3.5" />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <ShortcutDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        initial={editingShortcut}
      />
    </>
  )
}
