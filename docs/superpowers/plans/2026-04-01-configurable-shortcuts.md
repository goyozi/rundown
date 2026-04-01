# Configurable Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable shortcut buttons to the title bar that execute shell commands or Claude prompts into the active task's terminal, with command palette integration.

**Architecture:** New `Shortcut` type in shared types, persisted via electron-store through IPC (same pattern as tasks/groups/settings). A `ShortcutSlice` manages state in Zustand. Title bar renders shortcut buttons with dnd-kit reordering. Add/Edit dialog with searchable lucide icon picker. Command palette extended to search and execute shortcuts alongside tasks.

**Tech Stack:** React, TypeScript, Zustand, electron-store, @dnd-kit (horizontal sortable), shadcn/ui (Dialog, Input, Button, ContextMenu), lucide-react.

---

## File Structure

### New Files
- `src/renderer/src/store/slices/shortcut-slice.ts` — Zustand slice for shortcut CRUD + reorder
- `src/renderer/src/components/ShortcutBar.tsx` — title bar shortcuts area (+ button, icon buttons, dnd)
- `src/renderer/src/components/ShortcutDialog.tsx` — add/edit dialog with icon picker
- `src/renderer/src/components/IconPicker.tsx` — searchable lucide icon grid
- `src/renderer/src/lib/shortcut-icons.ts` — curated icon list + dynamic search helper
- `src/renderer/src/lib/execute-shortcut.ts` — execution logic (resolve target, auto-start, write to pty)

### Modified Files
- `src/shared/types.ts` — add `Shortcut` type
- `src/shared/channels.ts` — add `STORE_GET_SHORTCUTS` / `STORE_SAVE_SHORTCUTS` channels
- `src/main/validation.ts` — add `ShortcutSchema` / `ShortcutsArraySchema`
- `src/main/store.ts` — add `shortcuts` to StoreSchema + register IPC handlers
- `src/preload/index.ts` — add `getShortcuts` / `saveShortcuts` to API
- `src/preload/index.d.ts` — add type declarations for new API methods
- `src/renderer/src/store/task-store.ts` — compose `ShortcutSlice`, add `persistShortcuts`, load shortcuts in `loadTasks`
- `src/renderer/src/components/TitleBar.tsx` — render `ShortcutBar`, pass callbacks
- `src/renderer/src/components/GoToTask.tsx` — add shortcut results to command palette
- `src/renderer/src/lib/task-search.ts` — add shortcut search types/functions

---

### Task 1: Shared Types + IPC Channels

**Files:**
- Modify: `src/shared/types.ts:51` (append after Comment type)
- Modify: `src/shared/channels.ts:10` (add after root task order channels)

- [ ] **Step 1: Add Shortcut type to shared types**

In `src/shared/types.ts`, append after the `Comment` interface (after line 50):

```ts
export interface Shortcut {
  id: string
  name: string
  icon: string
  type: 'shell' | 'claude'
  command: string
  order: number
}
```

- [ ] **Step 2: Add IPC channels for shortcuts**

In `src/shared/channels.ts`, add after line 10 (`STORE_SAVE_ROOT_TASK_ORDER`):

```ts
  STORE_GET_SHORTCUTS: 'store:get-shortcuts',
  STORE_SAVE_SHORTCUTS: 'store:save-shortcuts',
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/channels.ts
git commit -m "feat(shortcuts): add Shortcut type and IPC channels"
```

---

### Task 2: Validation + Main Process Store

**Files:**
- Modify: `src/main/validation.ts:57` (append after CommentsPoolSchema)
- Modify: `src/main/store.ts:30-41` (StoreSchema), `src/main/store.ts:46-66` (defaults), `src/main/store.ts:129-288` (handlers)

- [ ] **Step 1: Add Zod schemas for shortcuts**

In `src/main/validation.ts`, append after `CommentsPoolSchema` (after line 57):

```ts
export const ShortcutSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  type: z.enum(['shell', 'claude']),
  command: z.string(),
  order: z.number()
})
export const ShortcutsArraySchema = z.array(ShortcutSchema)
```

- [ ] **Step 2: Add shortcuts to StoreSchema and defaults**

In `src/main/store.ts`, add the import for `Shortcut`:

Change the import line from:
```ts
import type { Task, TaskGroup, Comment, AppSettings } from '../shared/types'
```
to:
```ts
import type { Task, TaskGroup, Comment, AppSettings, Shortcut } from '../shared/types'
```

Add the import for `ShortcutsArraySchema`:

Change the validation import to also include `ShortcutsArraySchema`:
```ts
import {
  TasksArraySchema,
  GroupsArraySchema,
  ActiveGroupIdSchema,
  SidebarWidthSchema,
  RootTaskOrderSchema,
  DirPathSchema,
  BranchNameSchema,
  CommentsPoolSchema,
  AppSettingsSchema,
  ShortcutsArraySchema
} from './validation'
```

Add `shortcuts: Shortcut[]` to the `StoreSchema` interface (after `rootTaskOrder`):
```ts
interface StoreSchema {
  tasks: Task[]
  groups: TaskGroup[]
  activeGroupId: string
  windowState: WindowState
  sidebarWidth: number
  rootTaskOrder: Record<string, string[]>
  shortcuts: Shortcut[]
  comments: Record<string, Comment[]>
  settings: AppSettings
  serverPort: number
  schemaVersion: number
}
```

Add `shortcuts: []` to the defaults in `storeOptions` (after `rootTaskOrder: {}`):
```ts
    shortcuts: [],
```

- [ ] **Step 3: Register IPC handlers for shortcuts**

In `src/main/store.ts`, inside `registerStoreHandlers()`, add after the `STORE_SAVE_ROOT_TASK_ORDER` handler (after line 168):

```ts
  safeHandle(IPC.STORE_GET_SHORTCUTS, (): Shortcut[] => {
    return store.get('shortcuts')
  })

  safeHandle(IPC.STORE_SAVE_SHORTCUTS, (_event, shortcuts: unknown): void => {
    store.set('shortcuts', ShortcutsArraySchema.parse(shortcuts) as Shortcut[])
  })
```

- [ ] **Step 4: Commit**

```bash
git add src/main/validation.ts src/main/store.ts
git commit -m "feat(shortcuts): add validation schemas and store handlers"
```

---

### Task 3: Preload API

**Files:**
- Modify: `src/preload/index.ts:17` (after saveRootTaskOrder)
- Modify: `src/preload/index.d.ts:2` (import), `src/preload/index.d.ts:14` (after saveRootTaskOrder)

- [ ] **Step 1: Add shortcuts to preload API implementation**

In `src/preload/index.ts`, add the `Shortcut` import:

Change line 3 from:
```ts
import type { Task, TaskGroup, Comment, AppSettings, WorktreeRecord } from '../shared/types'
```
to:
```ts
import type { Task, TaskGroup, Comment, AppSettings, WorktreeRecord, Shortcut } from '../shared/types'
```

Add after `saveRootTaskOrder` (after line 17):
```ts
  getShortcuts: () => ipcRenderer.invoke(IPC.STORE_GET_SHORTCUTS),
  saveShortcuts: (shortcuts: Shortcut[]) => ipcRenderer.invoke(IPC.STORE_SAVE_SHORTCUTS, shortcuts),
```

- [ ] **Step 2: Add type declarations**

In `src/preload/index.d.ts`, add the `Shortcut` import:

Change line 2 from:
```ts
import type { Task, TaskGroup, Comment, AppSettings, WorktreeRecord } from '../shared/types'
```
to:
```ts
import type { Task, TaskGroup, Comment, AppSettings, WorktreeRecord, Shortcut } from '../shared/types'
```

Add after `saveRootTaskOrder` (after line 14):
```ts
  getShortcuts(): Promise<Shortcut[]>
  saveShortcuts(shortcuts: Shortcut[]): Promise<void>
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(shortcuts): expose shortcuts IPC in preload API"
```

---

### Task 4: Zustand ShortcutSlice

**Files:**
- Create: `src/renderer/src/store/slices/shortcut-slice.ts`
- Modify: `src/renderer/src/store/task-store.ts`

- [ ] **Step 1: Create the shortcut slice**

Create `src/renderer/src/store/slices/shortcut-slice.ts`:

```ts
import type { StateCreator } from 'zustand'
import type { Shortcut } from '../../../../shared/types'
import type { FullStore } from '../task-store'

export interface ShortcutSlice {
  shortcuts: Shortcut[]
  addShortcut: (shortcut: Omit<Shortcut, 'id' | 'order'>) => void
  updateShortcut: (id: string, partial: Partial<Omit<Shortcut, 'id'>>) => void
  deleteShortcut: (id: string) => void
  reorderShortcuts: (orderedIds: string[]) => void
}

export const createShortcutSlice: StateCreator<FullStore, [], [], ShortcutSlice> = (set, get) => ({
  shortcuts: [],

  addShortcut: (shortcut) => {
    const current = get().shortcuts
    const newShortcut: Shortcut = {
      ...shortcut,
      id: crypto.randomUUID(),
      order: current.length
    }
    set({ shortcuts: [...current, newShortcut] })
    get().persistShortcuts()
  },

  updateShortcut: (id, partial) => {
    set({
      shortcuts: get().shortcuts.map((s) => (s.id === id ? { ...s, ...partial } : s))
    })
    get().persistShortcuts()
  },

  deleteShortcut: (id) => {
    const filtered = get()
      .shortcuts.filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, order: i }))
    set({ shortcuts: filtered })
    get().persistShortcuts()
  },

  reorderShortcuts: (orderedIds) => {
    const current = get().shortcuts
    const byId = new Map(current.map((s) => [s.id, s]))
    const reordered = orderedIds
      .map((id, i) => {
        const s = byId.get(id)
        return s ? { ...s, order: i } : undefined
      })
      .filter((s): s is Shortcut => s !== undefined)
    set({ shortcuts: reordered })
    get().persistShortcuts()
  }
})
```

- [ ] **Step 2: Compose ShortcutSlice into the store**

In `src/renderer/src/store/task-store.ts`:

Add import (after the settings-slice import on line 13):
```ts
import { createShortcutSlice, type ShortcutSlice } from './slices/shortcut-slice'
```

Update the `PersistenceSlice` interface to add `persistShortcuts` (after `persistRootTaskOrder` on line 22):
```ts
  persistShortcuts: () => void
```

Update `FullStore` type to include `ShortcutSlice` (add after `SettingsSlice &`):
```ts
export type FullStore = TaskSlice &
  GroupSlice &
  SessionSlice &
  ShellTabSlice &
  OperationRequestSlice &
  SettingsSlice &
  ShortcutSlice &
  PersistenceSlice
```

Add `...createShortcutSlice(...a),` in the store creation (after `...createSettingsSlice(...a),` on line 42).

Add shortcuts to `loadTasks` — update the `Promise.all` call (line 49) to also load shortcuts:
```ts
        const [tasks, groups, activeGroupId, rootTaskOrder, settings, shortcuts] = await Promise.all([
          window.api.getTasks(),
          window.api.getGroups(),
          window.api.getActiveGroupId(),
          window.api.getRootTaskOrder(),
          window.api.getSettings(),
          window.api.getShortcuts()
        ])
        set({ tasks, groups, activeGroupId, rootTaskOrder, settings, shortcuts, loaded: true })
```

Add `persistShortcuts` debounced function (after `persistRootTaskOrder` around line 95):
```ts
    persistShortcuts: debouncedLeadingTrailing(async () => {
      try {
        await window.api.saveShortcuts(get().shortcuts)
      } catch (err) {
        window.api.logError(
          'Failed to persist shortcuts',
          err instanceof Error ? err.stack : String(err)
        )
      }
    }),
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/slices/shortcut-slice.ts src/renderer/src/store/task-store.ts
git commit -m "feat(shortcuts): add ShortcutSlice and wire into store"
```

---

### Task 5: Curated Icon List + Search Helper

**Files:**
- Create: `src/renderer/src/lib/shortcut-icons.ts`

- [ ] **Step 1: Create the icon helper module**

Create `src/renderer/src/lib/shortcut-icons.ts`:

```ts
import { icons } from 'lucide-react'

/** Curated icons shown when no search query is entered */
export const CURATED_ICON_NAMES: string[] = [
  'git-branch',
  'git-pull-request',
  'git-merge',
  'git-commit-horizontal',
  'play',
  'square-terminal',
  'terminal',
  'upload',
  'download',
  'refresh-cw',
  'rocket',
  'wrench',
  'settings',
  'shield',
  'zap',
  'send',
  'package',
  'bug',
  'test-tubes',
  'code'
]

/**
 * Search lucide icons by name. Returns icon names matching the query.
 * If query is empty, returns curated list.
 */
export function searchIcons(query: string, limit: number = 40): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return CURATED_ICON_NAMES

  return Object.keys(icons)
    .filter((name) => name.toLowerCase().includes(trimmed))
    .slice(0, limit)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/shortcut-icons.ts
git commit -m "feat(shortcuts): add curated icon list and search helper"
```

---

### Task 6: Icon Picker Component

**Files:**
- Create: `src/renderer/src/components/IconPicker.tsx`

- [ ] **Step 1: Create the IconPicker component**

Create `src/renderer/src/components/IconPicker.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { icons } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { searchIcons } from '@/lib/shortcut-icons'

interface IconPickerProps {
  value: string
  onChange: (iconName: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchIcons(query), [query])

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons..."
        className="h-8 text-xs"
      />
      <div className="grid grid-cols-8 gap-1 max-h-[180px] overflow-y-auto">
        {results.map((name) => {
          const IconComponent = icons[name as keyof typeof icons]
          if (!IconComponent) return null
          return (
            <button
              key={name}
              type="button"
              title={name}
              className={`size-9 flex items-center justify-center rounded-md transition-colors ${
                value === name
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
              onClick={() => onChange(name)}
            >
              <IconComponent className="size-4" />
            </button>
          )
        })}
        {results.length === 0 && (
          <div className="col-span-8 py-4 text-center text-xs text-muted-foreground">
            No icons found
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/IconPicker.tsx
git commit -m "feat(shortcuts): add searchable IconPicker component"
```

---

### Task 7: Add/Edit Shortcut Dialog

**Files:**
- Create: `src/renderer/src/components/ShortcutDialog.tsx`

- [ ] **Step 1: Create the ShortcutDialog component**

Create `src/renderer/src/components/ShortcutDialog.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPicker } from './IconPicker'
import type { Shortcut } from '../../../shared/types'

interface ShortcutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; icon: string; type: 'shell' | 'claude'; command: string }) => void
  initial?: Shortcut
}

export function ShortcutDialog({
  open,
  onOpenChange,
  onSave,
  initial
}: ShortcutDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<'shell' | 'claude'>('shell')
  const [command, setCommand] = useState('')
  const [icon, setIcon] = useState('terminal')

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setType(initial?.type ?? 'shell')
      setCommand(initial?.command ?? '')
      setIcon(initial?.icon ?? 'terminal')
    }
  }, [open, initial])

  const canSave = name.trim() !== '' && command.trim() !== ''

  const handleSave = (): void => {
    if (!canSave) return
    onSave({ name: name.trim(), icon, type, command: command.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Shortcut' : 'Add Shortcut'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Git Pull"
              className="h-8 text-sm"
            />
          </div>

          {/* Type toggle */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Type</label>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(['shell', 'claude'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`flex-1 px-2 h-7 rounded-sm text-xs transition-colors ${
                    type === t
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                  onClick={() => setType(t)}
                >
                  {t === 'shell' ? 'Shell command' : 'Claude prompt'}
                </button>
              ))}
            </div>
          </div>

          {/* Command */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Command</label>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={type === 'shell' ? 'e.g. git pull' : 'e.g. create a PR for the current branch'}
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Icon</label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canSave} onClick={handleSave}>
              {initial ? 'Save' : 'Add Shortcut'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ShortcutDialog.tsx
git commit -m "feat(shortcuts): add ShortcutDialog for add/edit"
```

---

### Task 8: Shortcut Execution Logic

**Files:**
- Create: `src/renderer/src/lib/execute-shortcut.ts`

- [ ] **Step 1: Create the execution module**

Create `src/renderer/src/lib/execute-shortcut.ts`:

```ts
import type { Shortcut } from '../../../shared/types'
import { useTaskStore } from '@/store/task-store'

const SESSION_START_DELAY_MS = 2000

/**
 * Execute a shortcut against the currently selected task.
 * Auto-starts session/shell if needed, waits for readiness, then writes the command.
 */
export async function executeShortcut(shortcut: Shortcut): Promise<void> {
  const state = useTaskStore.getState()
  const taskId = state.selectedTaskId
  if (!taskId) return

  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return

  if (shortcut.type === 'claude') {
    await executeClaude(taskId, shortcut.command, state)
  } else {
    await executeShell(taskId, shortcut.command, state)
  }
}

async function executeClaude(
  taskId: string,
  command: string,
  state: ReturnType<typeof useTaskStore.getState>
): Promise<void> {
  const hasSession = state.activeSessions.has(taskId)

  if (!hasSession) {
    const dir = state.getEffectiveDirectory(taskId)
    if (!dir) return
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    const result = await window.api.ptySpawn(taskId, dir, theme as 'light' | 'dark')
    if (!result.success) return
    state.startSession(taskId)
    await delay(SESSION_START_DELAY_MS)
  }

  // Switch to the Claude tab
  state.setActiveTab(taskId, 'claude')
  await window.api.ptyWrite(taskId, command + '\n')
}

async function executeShell(
  taskId: string,
  command: string,
  state: ReturnType<typeof useTaskStore.getState>
): Promise<void> {
  const shellTabs = state.getShellTabs(taskId)
  let sessionId: string

  if (shellTabs.length === 0) {
    // Auto-create a shell tab
    const id = `shell-auto-${crypto.randomUUID().slice(0, 8)}`
    sessionId = `${taskId}:${id}`
    const dir = state.getEffectiveDirectory(taskId)
    if (!dir) return
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    const result = await window.api.ptySpawnShell(sessionId, dir, theme as 'light' | 'dark')
    if (!result.success) return
    const tab = { id, label: 'Shell 1', sessionId }
    state.addShellTab(taskId, tab)
    state.setActiveTab(taskId, `shell:${id}`)
    await delay(SESSION_START_DELAY_MS)
  } else {
    // Use the first existing shell tab
    const tab = shellTabs[0]
    sessionId = tab.sessionId
    state.setActiveTab(taskId, `shell:${tab.id}`)
  }

  await window.api.ptyWrite(sessionId, command + '\n')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/execute-shortcut.ts
git commit -m "feat(shortcuts): add shortcut execution logic"
```

---

### Task 9: ShortcutBar Component (Title Bar Integration)

**Files:**
- Create: `src/renderer/src/components/ShortcutBar.tsx`
- Modify: `src/renderer/src/components/TitleBar.tsx`

- [ ] **Step 1: Create the ShortcutBar component**

Create `src/renderer/src/components/ShortcutBar.tsx`:

```tsx
import { useState, useCallback } from 'react'
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
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
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
        <ContextMenuItem onClick={() => onEdit(shortcut)}>Edit</ContextMenuItem>
        <ContextMenuItem
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

  const sorted = [...shortcuts].sort((a, b) => a.order - b.order)
  const sortedIds = sorted.map((s) => s.id)

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
  const ActiveIcon = activeShortcut
    ? icons[activeShortcut.icon as keyof typeof icons]
    : null

  const hasShortcuts = sorted.length > 0

  return (
    <>
      <div className="no-drag flex items-center gap-1">
        {/* + button */}
        {hasShortcuts ? (
          <button
            className="size-[26px] flex items-center justify-center rounded-md text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors cursor-pointer"
            onClick={handleAdd}
            title="Add Shortcut"
          >
            <Plus className="size-3.5" />
          </button>
        ) : (
          <button
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-primary/25 bg-primary/10 text-primary text-xs hover:bg-primary/15 transition-colors cursor-pointer"
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
```

- [ ] **Step 2: Update TitleBar to include ShortcutBar**

Replace the entire content of `src/renderer/src/components/TitleBar.tsx` with:

```tsx
import { Search } from 'lucide-react'
import { ShortcutBar } from './ShortcutBar'

interface TitleBarProps {
  onGoToTask: () => void
}

export function TitleBar({ onGoToTask }: TitleBarProps): React.JSX.Element {
  return (
    <div className="h-9 flex items-center justify-center bg-sidebar-bg border-b border-border drag-region shrink-0 pl-[80px]">
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
      <div className="absolute right-3">
        <ShortcutBar />
      </div>
    </div>
  )
}
```

Note: the search bar gets `z-10` so it sits above shortcuts on overflow. The shortcut bar is positioned `absolute right-3` within the title bar.

- [ ] **Step 3: Verify the Tooltip component exists**

Run: `ls src/renderer/src/components/ui/tooltip.tsx`

If the tooltip component doesn't exist, add it:

```bash
pnpm dlx shadcn@latest add tooltip
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ShortcutBar.tsx src/renderer/src/components/TitleBar.tsx
git commit -m "feat(shortcuts): add ShortcutBar with dnd reorder and title bar integration"
```

---

### Task 10: Command Palette Integration

**Files:**
- Modify: `src/renderer/src/lib/task-search.ts`
- Modify: `src/renderer/src/components/GoToTask.tsx`

- [ ] **Step 1: Add shortcut search types and function to task-search**

In `src/renderer/src/lib/task-search.ts`, add the import at line 1:

```ts
import type { Task, TaskGroup, Shortcut } from '../../../shared/types'
```

Remove the old import: `import type { Task, TaskGroup } from '../../../shared/types'`

Append at the end of the file (after line 120):

```ts
export interface ShortcutSearchResult {
  shortcut: Shortcut
  matchedIndices: number[]
}

/**
 * Search shortcuts by name. Same multi-token matching as tasks but against shortcut name.
 */
export function searchShortcuts(
  query: string,
  shortcuts: Shortcut[],
  limit: number = 4
): ShortcutSearchResult[] {
  const raw = query.trim()
  if (!raw) return shortcuts.slice(0, limit).map((shortcut) => ({ shortcut, matchedIndices: [] }))

  const tokens = raw.toLowerCase().split(/\s+/)
  const results: ShortcutSearchResult[] = []

  for (const shortcut of shortcuts) {
    const lower = shortcut.name.toLowerCase()
    let allMatch = true
    const matchedIndices: number[] = []
    const used = new Set<number>()

    for (const token of tokens) {
      let pos = 0
      let found = false
      while (pos <= lower.length - token.length) {
        const idx = lower.indexOf(token, pos)
        if (idx === -1) break
        const indices = Array.from({ length: token.length }, (_, i) => idx + i)
        if (indices.every((i) => !used.has(i))) {
          indices.forEach((i) => {
            matchedIndices.push(i)
            used.add(i)
          })
          found = true
          break
        }
        pos = idx + 1
      }
      if (!found) {
        allMatch = false
        break
      }
    }

    if (allMatch) {
      matchedIndices.sort((a, b) => a - b)
      results.push({ shortcut, matchedIndices })
    }
  }

  results.sort((a, b) => {
    const aLower = a.shortcut.name.toLowerCase()
    const bLower = b.shortcut.name.toLowerCase()
    const aStarts = tokens.some((t) => aLower.startsWith(t)) ? 0 : 1
    const bStarts = tokens.some((t) => bLower.startsWith(t)) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return aLower.localeCompare(bLower)
  })

  return results.slice(0, limit)
}
```

- [ ] **Step 2: Update GoToTask to show shortcuts**

In `src/renderer/src/components/GoToTask.tsx`:

Update imports (line 4-5) to add:
```ts
import { buildSearchableList, searchTasks, searchShortcuts } from '@/lib/task-search'
import type { ShortcutSearchResult } from '@/lib/task-search'
import { Check, Circle } from 'lucide-react'
import { icons } from 'lucide-react'
import { executeShortcut } from '@/lib/execute-shortcut'
```

In the store selector (lines 17-25), add `shortcuts`:
```ts
  const { tasks, groups, activeGroupId, setActiveGroup, selectTask, shortcuts } = useTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      groups: s.groups,
      activeGroupId: s.activeGroupId,
      setActiveGroup: s.setActiveGroup,
      selectTask: s.selectTask,
      shortcuts: s.shortcuts
    }))
  )
```

After the `results` memo (line 28), add a shortcut results memo:
```ts
  const shortcutResults = useMemo(
    () => searchShortcuts(query, shortcuts),
    [query, shortcuts]
  )
  const totalResults = results.length + shortcutResults.length
```

Update `handleKeyDown` to handle the combined list. Replace the `handleKeyDown` callback with:

```ts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, totalResults - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex < results.length) {
          const result = results[highlightIndex]
          if (result) navigateToTask(result.task.id, result.task.groupId)
        } else {
          const scResult = shortcutResults[highlightIndex - results.length]
          if (scResult) {
            executeShortcut(scResult.shortcut)
            onClose()
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results, shortcutResults, totalResults, highlightIndex, navigateToTask, onClose]
  )
```

In the JSX results section, after the task results `map` block (after line 150) and before the footer, add shortcut results:

```tsx
            {/* Shortcut results */}
            {shortcutResults.length > 0 && (
              <>
                {results.length > 0 && (
                  <div className="px-3 py-1 text-[11px] text-muted-foreground/50 uppercase tracking-wider">
                    Shortcuts
                  </div>
                )}
                {shortcutResults.map((result, index) => {
                  const globalIndex = results.length + index
                  const IconComponent = icons[result.shortcut.icon as keyof typeof icons]
                  return (
                    <div
                      key={result.shortcut.id}
                      role="option"
                      aria-selected={globalIndex === highlightIndex}
                      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm ${
                        globalIndex === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                      }`}
                      onClick={() => {
                        executeShortcut(result.shortcut)
                        onClose()
                      }}
                      onMouseEnter={() => setHighlightIndex(globalIndex)}
                      data-testid="go-to-task-shortcut-result"
                    >
                      {IconComponent ? (
                        <IconComponent className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Circle className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="flex-1 truncate text-muted-foreground">
                        <HighlightedBreadcrumb
                          text={result.shortcut.name}
                          matchedIndices={result.matchedIndices}
                        />
                      </span>
                      <span className="text-xs text-muted-foreground/60 shrink-0">
                        Run
                      </span>
                    </div>
                  )
                })}
              </>
            )}
```

Update the "No matching tasks" empty state (line 113-116) to also check shortcuts:
```tsx
            {results.length === 0 && shortcutResults.length === 0 && query.trim() && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching tasks or shortcuts
              </div>
            )}
```

Update the placeholder text in the search input (line 105) from `"Go to Task…"` to `"Go to... / Run..."`.

Update the footer (lines 154-164) to include "run shortcut":
```tsx
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground/60">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> go / run
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Esc</kbd> close
            </span>
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/task-search.ts src/renderer/src/components/GoToTask.tsx
git commit -m "feat(shortcuts): integrate shortcuts into command palette"
```

---

### Task 11: Lint + Typecheck + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run linter**

Run: `pnpm lint`
Expected: no new errors

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no type errors

- [ ] **Step 3: Fix any issues found**

Address any lint or type errors from steps 1-2.

- [ ] **Step 4: Run the app in dev mode**

Run: `pnpm dev`

Manually verify:
- Title bar shows "+ Add shortcut" button on the right (when no shortcuts exist)
- Clicking it opens the Add Shortcut dialog
- Can create a shell shortcut (e.g. "Git Status" with `git status`, terminal icon)
- After creation, the + button collapses to subtle gray icon
- Shortcut button appears with tooltip
- Right-click shows Edit / Delete context menu
- Can drag to reorder
- ⌘P shows shortcuts under "Shortcuts" section
- Clicking a shortcut from palette or title bar executes it

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(shortcuts): address lint and type errors"
```
