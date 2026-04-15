# Back/Forward Navigation & CMD+E Task Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-style back/forward navigation and alt-tab-style recent task switching (CMD+E) to Rundown.

**Architecture:** Pure navigation logic (stack/MRU manipulation) lives in `src/renderer/src/lib/navigation.ts` and is unit-tested independently. A new `NavigationSlice` in the Zustand store wires those pure functions to app state. All existing `selectTask` call sites migrate to `navigateToTask`. Two new components: `NavButtons` (title bar) and `RecentTaskSwitcher` (CMD+E overlay).

**Tech Stack:** React, TypeScript, Zustand, lucide-react, vitest (unit), Playwright (E2E)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/renderer/src/lib/navigation.ts` | Create | Pure functions: stack push/pop, MRU reorder, deleted-task filtering |
| `src/renderer/src/store/slices/navigation-slice.ts` | Create | Zustand slice: wires pure functions to store, calls selectTask/setActiveGroup |
| `src/renderer/src/components/NavButtons.tsx` | Create | Back/forward chevron buttons for TitleBar |
| `src/renderer/src/components/RecentTaskSwitcher.tsx` | Create | CMD+E overlay: MRU list, keydown/keyup lifecycle |
| `src/renderer/src/store/task-store.ts` | Modify | Add NavigationSlice to FullStore type union and create call |
| `src/renderer/src/components/TitleBar.tsx` | Modify | Render NavButtons, increase left padding |
| `src/renderer/src/components/GoToTask.tsx` | Modify | Replace local navigateToTask with store's navigateToTask |
| `src/renderer/src/components/TaskItem.tsx` | Modify | Replace selectTask with navigateToTask |
| `src/renderer/src/hooks/use-pane-keyboard-nav.ts` | Modify | Replace selectTask with navigateToTask, add CMD+[/]/E shortcuts |
| `src/renderer/src/hooks/use-task-keyboard-nav.ts` | Modify | Replace selectTask with navigateToTask |
| `src/renderer/src/App.tsx` | Modify | Add RecentTaskSwitcher state, pass to keyboard handler |
| `vitest.config.ts` | Modify | Extend include to pick up navigation tests |
| `src/main/__tests__/navigation.test.ts` | Create | Unit tests for pure navigation functions |
| `tests/navigation.spec.ts` | Create | E2E Playwright tests |

---

### Task 1: Pure Navigation Functions + Unit Tests

**Files:**
- Create: `src/renderer/src/lib/navigation.ts`
- Create: `src/main/__tests__/navigation.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Extend vitest config to include navigation test**

In `vitest.config.ts`, add the navigation test path to the include array:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/main/__tests__/**/*.test.ts'
    ],
    environment: 'node'
  }
})
```

No change needed — the navigation test will live in `src/main/__tests__/` and is already matched by the existing glob.

- [ ] **Step 2: Write failing tests for pushNavigation**

Create `src/main/__tests__/navigation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  pushNavigation,
  goBack,
  goForward,
  getMruExcludingCurrent,
  type NavigationEntry,
  type NavigationState
} from '../../renderer/src/lib/navigation'

function entry(taskId: string, groupId = 'g1'): NavigationEntry {
  return { taskId, groupId }
}

function emptyState(): NavigationState {
  return { backStack: [], forwardStack: [], mruList: [] }
}

describe('pushNavigation', () => {
  it('pushes current onto backStack and clears forwardStack', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [entry('x')],
      mruList: []
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.backStack).toEqual([entry('a')])
    expect(result.forwardStack).toEqual([])
  })

  it('adds target to front of mruList', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: [entry('a')]
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.mruList[0]).toEqual(entry('b'))
  })

  it('deduplicates target in mruList', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: [entry('a'), entry('b'), entry('c')]
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.mruList.map((e) => e.taskId)).toEqual(['b', 'a', 'c'])
  })

  it('returns unchanged state when navigating to same task', () => {
    const state: NavigationState = {
      backStack: [entry('x')],
      forwardStack: [entry('y')],
      mruList: [entry('a')]
    }
    const result = pushNavigation(state, entry('a'), entry('a'))
    expect(result).toBe(state)
  })

  it('skips backStack push when current is null', () => {
    const state = emptyState()
    const result = pushNavigation(state, null, entry('a'))
    expect(result.backStack).toEqual([])
    expect(result.mruList).toEqual([entry('a')])
  })

  it('caps backStack at 100 entries', () => {
    const state: NavigationState = {
      backStack: Array.from({ length: 100 }, (_, i) => entry(`t${i}`)),
      forwardStack: [],
      mruList: []
    }
    const result = pushNavigation(state, entry('current'), entry('new'))
    expect(result.backStack).toHaveLength(100)
    expect(result.backStack[0]).toEqual(entry('t1'))
    expect(result.backStack[99]).toEqual(entry('current'))
  })

  it('caps mruList at 10 entries', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: Array.from({ length: 10 }, (_, i) => entry(`t${i}`))
    }
    const result = pushNavigation(state, entry('current'), entry('new'))
    expect(result.mruList).toHaveLength(10)
    expect(result.mruList[0]).toEqual(entry('new'))
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:unit -- --run`

Expected: FAIL — module `../../renderer/src/lib/navigation` does not exist.

- [ ] **Step 4: Implement pushNavigation**

Create `src/renderer/src/lib/navigation.ts`:

```typescript
export interface NavigationEntry {
  taskId: string
  groupId: string
}

export interface NavigationState {
  backStack: NavigationEntry[]
  forwardStack: NavigationEntry[]
  mruList: NavigationEntry[]
}

const MAX_BACK_FORWARD = 100
const MAX_MRU = 10

function pushMru(mruList: NavigationEntry[], entry: NavigationEntry): NavigationEntry[] {
  const filtered = mruList.filter((e) => e.taskId !== entry.taskId)
  return [entry, ...filtered].slice(0, MAX_MRU)
}

export function pushNavigation(
  state: NavigationState,
  current: NavigationEntry | null,
  target: NavigationEntry
): NavigationState {
  if (current && current.taskId === target.taskId) return state

  const backStack = current
    ? [...state.backStack, current].slice(-MAX_BACK_FORWARD)
    : state.backStack

  return {
    backStack,
    forwardStack: [],
    mruList: pushMru(state.mruList, target)
  }
}
```

- [ ] **Step 5: Run tests to verify pushNavigation passes**

Run: `pnpm test:unit -- --run`

Expected: All `pushNavigation` tests PASS.

- [ ] **Step 6: Write failing tests for goBack and goForward**

Append to `src/main/__tests__/navigation.test.ts`:

```typescript
describe('goBack', () => {
  const exists = (): boolean => true

  it('pops from backStack and pushes current onto forwardStack', () => {
    const state: NavigationState = {
      backStack: [entry('a'), entry('b')],
      forwardStack: [],
      mruList: []
    }
    const result = goBack(state, entry('c'), exists)
    expect(result).not.toBeNull()
    expect(result!.target).toEqual(entry('b'))
    expect(result!.state.backStack).toEqual([entry('a')])
    expect(result!.state.forwardStack).toEqual([entry('c')])
  })

  it('returns null when backStack is empty', () => {
    const result = goBack(emptyState(), entry('a'), exists)
    expect(result).toBeNull()
  })

  it('skips deleted tasks', () => {
    const state: NavigationState = {
      backStack: [entry('a'), entry('deleted'), entry('b')],
      forwardStack: [],
      mruList: []
    }
    const existsFn = (id: string): boolean => id !== 'deleted'
    const result = goBack(state, entry('c'), existsFn)
    expect(result!.target).toEqual(entry('b'))
    expect(result!.state.backStack).toEqual([entry('a')])
  })

  it('returns null when all back entries are deleted', () => {
    const state: NavigationState = {
      backStack: [entry('x'), entry('y')],
      forwardStack: [],
      mruList: []
    }
    const result = goBack(state, entry('c'), () => false)
    expect(result).toBeNull()
  })

  it('updates mruList with target', () => {
    const state: NavigationState = {
      backStack: [entry('a')],
      forwardStack: [],
      mruList: [entry('c'), entry('b')]
    }
    const result = goBack(state, entry('c'), exists)
    expect(result!.state.mruList[0]).toEqual(entry('a'))
  })
})

describe('goForward', () => {
  const exists = (): boolean => true

  it('pops from forwardStack and pushes current onto backStack', () => {
    const state: NavigationState = {
      backStack: [entry('a')],
      forwardStack: [entry('c'), entry('d')],
      mruList: []
    }
    const result = goForward(state, entry('b'), exists)
    expect(result!.target).toEqual(entry('d'))
    expect(result!.state.backStack).toEqual([entry('a'), entry('b')])
    expect(result!.state.forwardStack).toEqual([entry('c')])
  })

  it('returns null when forwardStack is empty', () => {
    const result = goForward(emptyState(), entry('a'), exists)
    expect(result).toBeNull()
  })

  it('skips deleted tasks', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [entry('a'), entry('deleted')],
      mruList: []
    }
    const existsFn = (id: string): boolean => id !== 'deleted'
    const result = goForward(state, entry('b'), existsFn)
    expect(result!.target).toEqual(entry('a'))
  })
})

describe('getMruExcludingCurrent', () => {
  it('excludes the current task', () => {
    const mru = [entry('a'), entry('b'), entry('c')]
    const result = getMruExcludingCurrent(mru, 'a')
    expect(result.map((e) => e.taskId)).toEqual(['b', 'c'])
  })

  it('returns full list when currentTaskId is null', () => {
    const mru = [entry('a'), entry('b')]
    const result = getMruExcludingCurrent(mru, null)
    expect(result).toEqual(mru)
  })

  it('returns empty array when mru is empty', () => {
    expect(getMruExcludingCurrent([], 'a')).toEqual([])
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `pnpm test:unit -- --run`

Expected: FAIL — `goBack`, `goForward`, `getMruExcludingCurrent` not exported.

- [ ] **Step 8: Implement goBack, goForward, getMruExcludingCurrent**

Add to `src/renderer/src/lib/navigation.ts`:

```typescript
export function goBack(
  state: NavigationState,
  current: NavigationEntry,
  taskExists: (taskId: string) => boolean
): { state: NavigationState; target: NavigationEntry } | null {
  const backStack = [...state.backStack]
  let target: NavigationEntry | undefined

  while (backStack.length > 0) {
    const candidate = backStack.pop()!
    if (taskExists(candidate.taskId)) {
      target = candidate
      break
    }
  }

  if (!target) return null

  return {
    state: {
      backStack,
      forwardStack: [...state.forwardStack, current].slice(-MAX_BACK_FORWARD),
      mruList: pushMru(state.mruList, target)
    },
    target
  }
}

export function goForward(
  state: NavigationState,
  current: NavigationEntry,
  taskExists: (taskId: string) => boolean
): { state: NavigationState; target: NavigationEntry } | null {
  const forwardStack = [...state.forwardStack]
  let target: NavigationEntry | undefined

  while (forwardStack.length > 0) {
    const candidate = forwardStack.pop()!
    if (taskExists(candidate.taskId)) {
      target = candidate
      break
    }
  }

  if (!target) return null

  return {
    state: {
      backStack: [...state.backStack, current].slice(-MAX_BACK_FORWARD),
      forwardStack,
      mruList: pushMru(state.mruList, target)
    },
    target
  }
}

export function getMruExcludingCurrent(
  mruList: NavigationEntry[],
  currentTaskId: string | null
): NavigationEntry[] {
  if (!currentTaskId) return mruList
  return mruList.filter((e) => e.taskId !== currentTaskId)
}
```

- [ ] **Step 9: Run tests to verify all pass**

Run: `pnpm test:unit -- --run`

Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/lib/navigation.ts src/main/__tests__/navigation.test.ts
git commit -m "feat: add pure navigation functions with tests (back/forward + MRU)"
```

---

### Task 2: NavigationSlice + Store Wiring

**Files:**
- Create: `src/renderer/src/store/slices/navigation-slice.ts`
- Modify: `src/renderer/src/store/task-store.ts`

- [ ] **Step 1: Create the NavigationSlice**

Create `src/renderer/src/store/slices/navigation-slice.ts`:

```typescript
import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'
import {
  pushNavigation,
  goBack as goBackPure,
  goForward as goForwardPure,
  getMruExcludingCurrent,
  type NavigationEntry,
  type NavigationState
} from '../../lib/navigation'

export type { NavigationEntry }

export interface NavigationSlice {
  backStack: NavigationEntry[]
  forwardStack: NavigationEntry[]
  mruList: NavigationEntry[]

  navigateToTask: (taskId: string, groupId?: string) => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getMruList: () => NavigationEntry[]
}

function getNavState(get: () => FullStore): NavigationState {
  const { backStack, forwardStack, mruList } = get()
  return { backStack, forwardStack, mruList }
}

function getCurrentEntry(get: () => FullStore): NavigationEntry | null {
  const { selectedTaskId, activeGroupId } = get()
  if (!selectedTaskId) return null
  return { taskId: selectedTaskId, groupId: activeGroupId }
}

function applyNavigation(
  get: () => FullStore,
  set: (partial: Partial<FullStore>) => void,
  target: NavigationEntry,
  newState: NavigationState
): void {
  const { activeGroupId, setActiveGroup, selectTask } = get()
  set({
    backStack: newState.backStack,
    forwardStack: newState.forwardStack,
    mruList: newState.mruList
  })

  if (target.groupId !== activeGroupId) {
    setActiveGroup(target.groupId)
    requestAnimationFrame(() => selectTask(target.taskId))
  } else {
    selectTask(target.taskId)
  }
}

export const createNavigationSlice: StateCreator<FullStore, [], [], NavigationSlice> = (
  set,
  get
) => ({
  backStack: [],
  forwardStack: [],
  mruList: [],

  navigateToTask: (taskId, groupId) => {
    const effectiveGroupId = groupId ?? get().activeGroupId
    const current = getCurrentEntry(get)
    const target: NavigationEntry = { taskId, groupId: effectiveGroupId }
    const currentState = getNavState(get)
    const newState = pushNavigation(currentState, current, target)
    if (newState === currentState) return // no-op (same task)
    applyNavigation(get, set, target, newState)
  },

  goBack: () => {
    const current = getCurrentEntry(get)
    if (!current) return
    const taskExists = (id: string): boolean => get().getTask(id) !== undefined
    const result = goBackPure(getNavState(get), current, taskExists)
    if (!result) return
    applyNavigation(get, set, result.target, result.state)
  },

  goForward: () => {
    const current = getCurrentEntry(get)
    if (!current) return
    const taskExists = (id: string): boolean => get().getTask(id) !== undefined
    const result = goForwardPure(getNavState(get), current, taskExists)
    if (!result) return
    applyNavigation(get, set, result.target, result.state)
  },

  canGoBack: () => get().backStack.length > 0,

  canGoForward: () => get().forwardStack.length > 0,

  getMruList: () => getMruExcludingCurrent(get().mruList, get().selectedTaskId)
})
```

- [ ] **Step 2: Add NavigationSlice to the store**

In `src/renderer/src/store/task-store.ts`, add the import and wire the slice:

Add import at top:

```typescript
import { createNavigationSlice, type NavigationSlice } from './slices/navigation-slice'
```

Update FullStore type:

```typescript
export type FullStore = TaskSlice &
  GroupSlice &
  SessionSlice &
  ShellTabSlice &
  OperationRequestSlice &
  SettingsSlice &
  ShortcutSlice &
  NavigationSlice &
  PersistenceSlice
```

Add the slice spread inside `create<FullStore>()`:

```typescript
...createNavigationSlice(...a),
```

Place it after `...createShortcutSlice(...a),`.

- [ ] **Step 3: Verify the app builds**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/slices/navigation-slice.ts src/renderer/src/store/task-store.ts
git commit -m "feat: add NavigationSlice to Zustand store"
```

---

### Task 3: Migrate Call Sites to navigateToTask

**Files:**
- Modify: `src/renderer/src/components/GoToTask.tsx`
- Modify: `src/renderer/src/components/TaskItem.tsx`
- Modify: `src/renderer/src/hooks/use-pane-keyboard-nav.ts`
- Modify: `src/renderer/src/hooks/use-task-keyboard-nav.ts`

- [ ] **Step 1: Migrate GoToTask.tsx**

In `src/renderer/src/components/GoToTask.tsx`:

Replace the store selector (lines 18-27) — remove `setActiveGroup` and `selectTask`, add `navigateToTask`:

```typescript
  const { tasks, groups, activeGroupId, navigateToTask, shortcuts } = useTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      groups: s.groups,
      activeGroupId: s.activeGroupId,
      navigateToTask: s.navigateToTask,
      shortcuts: s.shortcuts
    }))
  )
```

Replace the local `navigateToTask` callback (lines 48-61) with a simpler version:

```typescript
  const handleNavigateToTask = useCallback(
    (taskId: string, groupId: string) => {
      navigateToTask(taskId, groupId)
      onClose()
    },
    [navigateToTask, onClose]
  )
```

Update all references from `navigateToTask` to `handleNavigateToTask` in the JSX:
- Line 75: `if (result) handleNavigateToTask(result.task.id, result.task.groupId)`
- Line 137: `onClick={() => handleNavigateToTask(result.task.id, result.task.groupId)}`

- [ ] **Step 2: Migrate TaskItem.tsx**

In `src/renderer/src/components/TaskItem.tsx`:

In the store selector (lines 58-78), replace `selectTask` with `navigateToTask` and add `activeGroupId`:

```typescript
      selectTask: s.selectTask,
```

becomes:

```typescript
      navigateToTask: s.navigateToTask,
      activeGroupId: s.activeGroupId,
```

Update the destructured variables accordingly (remove `selectTask`, add `navigateToTask` and `activeGroupId`).

Replace the click handler on line 165:

```typescript
onClick={() => selectTask(task.id)}
```

becomes:

```typescript
onClick={() => navigateToTask(task.id, activeGroupId)}
```

- [ ] **Step 3: Migrate use-pane-keyboard-nav.ts**

In `src/renderer/src/hooks/use-pane-keyboard-nav.ts`:

In the handler function (line 27), change:

```typescript
      const { selectedTaskId, selectTask } = store
```

to:

```typescript
      const { selectedTaskId, navigateToTask, activeGroupId } = store
```

Replace all `selectTask(ids[...])` calls (lines 43, 44, 46, 54, 56, 58) with `navigateToTask(ids[...], activeGroupId)`. There are 6 occurrences total across the ArrowDown/j and ArrowUp/k blocks:

- `selectTask(ids[idx + 1])` → `navigateToTask(ids[idx + 1], activeGroupId)`
- `selectTask(ids[0])` → `navigateToTask(ids[0], activeGroupId)`
- `selectTask(ids[idx - 1])` → `navigateToTask(ids[idx - 1], activeGroupId)`
- `selectTask(ids[ids.length - 1])` → `navigateToTask(ids[ids.length - 1], activeGroupId)`

- [ ] **Step 4: Migrate use-task-keyboard-nav.ts**

In `src/renderer/src/hooks/use-task-keyboard-nav.ts`:

In the handler function (line 19), change:

```typescript
      const { selectedTaskId, selectTask } = store
```

to:

```typescript
      const { selectedTaskId, navigateToTask, activeGroupId } = store
```

Replace `selectTask` calls in `moveDown` and `moveUp` with `navigateToTask`:

In `moveDown` (lines 28-33):
- `selectTask(visibleIds[currentIndex + 1])` → `navigateToTask(visibleIds[currentIndex + 1], activeGroupId)`
- `selectTask(visibleIds[0])` → `navigateToTask(visibleIds[0], activeGroupId)`

In `moveUp` (lines 35-44):
- `selectTask(visibleIds[currentIndex - 1])` → `navigateToTask(visibleIds[currentIndex - 1], activeGroupId)`
- `selectTask(null)` stays as-is — this moves focus to the input, not a task navigation. Keep using the raw `selectTask` for this.
- `selectTask(visibleIds[visibleIds.length - 1])` → `navigateToTask(visibleIds[visibleIds.length - 1], activeGroupId)`

For the `selectTask(null)` call, also destructure `selectTask` from the store:

```typescript
      const { selectedTaskId, selectTask, navigateToTask, activeGroupId } = store
```

- [ ] **Step 5: Verify the app builds**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 6: Run E2E tests to check for regressions**

Run: `pnpm test`

Expected: All existing tests PASS (the migration is behavioral — same navigation, now history-tracked).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/GoToTask.tsx src/renderer/src/components/TaskItem.tsx src/renderer/src/hooks/use-pane-keyboard-nav.ts src/renderer/src/hooks/use-task-keyboard-nav.ts
git commit -m "refactor: migrate all selectTask call sites to navigateToTask"
```

---

### Task 4: NavButtons Component + TitleBar Integration

**Files:**
- Create: `src/renderer/src/components/NavButtons.tsx`
- Modify: `src/renderer/src/components/TitleBar.tsx`

- [ ] **Step 1: Create the NavButtons component**

Create `src/renderer/src/components/NavButtons.tsx`:

```typescript
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
```

- [ ] **Step 2: Add NavButtons to TitleBar**

In `src/renderer/src/components/TitleBar.tsx`:

Add import:

```typescript
import { NavButtons } from './NavButtons'
```

Update the outer div's padding from `pl-[80px]` to `pl-[130px]` and add NavButtons between the padding and the Go to bar button. Replace the full return:

```typescript
export function TitleBar({ onGoToTask }: TitleBarProps): React.JSX.Element {
  return (
    <div className="h-9 flex items-center justify-center bg-sidebar-bg border-b border-border drag-region shrink-0 pl-[130px]">
      <NavButtons />
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
```

- [ ] **Step 3: Verify it builds and renders**

Run: `pnpm typecheck`

Then run `pnpm dev` and visually confirm the back/forward buttons appear in the title bar between the traffic lights and the Go to bar. Both buttons should be dimmed (disabled) since there's no navigation history yet.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NavButtons.tsx src/renderer/src/components/TitleBar.tsx
git commit -m "feat: add back/forward nav buttons to title bar"
```

---

### Task 5: CMD+[ and CMD+] Keyboard Shortcuts

**Files:**
- Modify: `src/renderer/src/hooks/use-pane-keyboard-nav.ts`

- [ ] **Step 1: Add back/forward keyboard shortcuts**

In `src/renderer/src/hooks/use-pane-keyboard-nav.ts`, inside the `handler` function, add cases for CMD+[ and CMD+] before the existing Cmd+T block (after the `if (document.querySelector('[role="dialog"]')) return` check):

```typescript
      // Skip all shortcuts when the recent task switcher is open (it handles its own events)
      if (document.querySelector('[data-testid="recent-task-switcher-overlay"]')) return

      // Cmd+[: go back
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault()
        store.goBack()
        return
      }

      // Cmd+]: go forward
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        store.goForward()
        return
      }
```

- [ ] **Step 2: Verify the app builds**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 3: Manual test**

Run `pnpm dev`:
1. Click task A, then task B, then task C
2. Press CMD+[ — should go back to B
3. Press CMD+[ — should go back to A
4. Press CMD+] — should go forward to B
5. Back/forward buttons in title bar should enable/disable accordingly

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/use-pane-keyboard-nav.ts
git commit -m "feat: add CMD+[ and CMD+] keyboard shortcuts for back/forward"
```

---

### Task 6: RecentTaskSwitcher Component

**Files:**
- Create: `src/renderer/src/components/RecentTaskSwitcher.tsx`

- [ ] **Step 1: Create the RecentTaskSwitcher component**

Create `src/renderer/src/components/RecentTaskSwitcher.tsx`:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { Circle, CheckCircle2 } from 'lucide-react'

interface RecentTaskSwitcherProps {
  onClose: () => void
}

export function RecentTaskSwitcher({ onClose }: RecentTaskSwitcherProps): React.JSX.Element | null {
  const { mruList, navigateToTask, tasks, groups } = useTaskStore(
    useShallow((s) => ({
      mruList: s.getMruList(),
      navigateToTask: s.navigateToTask,
      tasks: s.tasks,
      groups: s.groups
    }))
  )

  const [highlightIndex, setHighlightIndex] = useState(0)
  const committedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Build breadcrumbs for display
  const items = mruList.map((entry) => {
    const task = tasks.find((t) => t.id === entry.taskId)
    const group = groups.find((g) => g.id === entry.groupId)
    const groupName = group?.name ?? ''
    const description = task?.description ?? 'Unknown task'
    const state = task?.state ?? 'idle'
    return { ...entry, description, groupName, state }
  })

  const commit = useCallback(
    (index: number) => {
      if (committedRef.current) return
      committedRef.current = true
      const item = items[index]
      if (item) {
        navigateToTask(item.taskId, item.groupId)
      }
      onClose()
    },
    [items, navigateToTask, onClose]
  )

  const cancel = useCallback(() => {
    if (committedRef.current) return
    committedRef.current = true
    onClose()
  }, [onClose])

  // Keydown/keyup lifecycle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          // Move highlight backwards with wrap
          setHighlightIndex((i) => (i - 1 + items.length) % items.length)
        } else {
          // Move highlight forward with wrap
          setHighlightIndex((i) => (i + 1) % items.length)
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
        return
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      // Release Meta/Cmd = commit
      if (e.key === 'Meta' || e.key === 'Control') {
        commit(highlightIndex)
      }
    }

    const handleBlur = (): void => {
      // Window lost focus while CMD held — commit
      commit(highlightIndex)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, [items.length, highlightIndex, commit, cancel])

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  if (items.length === 0) {
    onClose()
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={cancel}
      data-testid="recent-task-switcher-overlay"
    >
      <div
        className="absolute inset-x-0 flex justify-center pl-[130px] pointer-events-none"
        style={{ top: 36 }}
      >
        <div
          className="w-full max-w-[500px] mx-4 bg-popover border border-border rounded-b-lg shadow-lg overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">
            Recent Tasks
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto" role="listbox">
            {items.map((item, index) => (
              <div
                key={item.taskId}
                role="option"
                aria-selected={index === highlightIndex}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm ${
                  index === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => {
                  navigateToTask(item.taskId, item.groupId)
                  onClose()
                }}
                onMouseEnter={() => setHighlightIndex(index)}
                data-testid="recent-task-result"
              >
                {item.state === 'done' ? (
                  <CheckCircle2 className="size-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground/60 text-xs">{item.groupName} &gt; </span>
                  <span className="text-foreground">{item.description}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground/60">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">⌘E</kbd> next
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">⇧⌘E</kbd> prev
            </span>
            <span>release ⌘ to switch</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/RecentTaskSwitcher.tsx
git commit -m "feat: add RecentTaskSwitcher component for CMD+E"
```

---

### Task 7: CMD+E Shortcut + App Integration

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/hooks/use-pane-keyboard-nav.ts`

- [ ] **Step 1: Add RecentTaskSwitcher state to App.tsx**

In `src/renderer/src/App.tsx`:

Add import:

```typescript
import { RecentTaskSwitcher } from './components/RecentTaskSwitcher'
```

Add state alongside `goToTaskOpen`:

```typescript
  const [recentSwitcherOpen, setRecentSwitcherOpen] = useState(false)
```

Render the component next to GoToTask (after line 115):

```typescript
        {goToTaskOpen && <GoToTask onClose={() => setGoToTaskOpen(false)} />}
        {recentSwitcherOpen && <RecentTaskSwitcher onClose={() => setRecentSwitcherOpen(false)} />}
```

Pass the setter to usePaneKeyboardNav so it can open the switcher. Change the hook call:

```typescript
  usePaneKeyboardNav({ onOpenRecentSwitcher: () => setRecentSwitcherOpen(true) })
```

- [ ] **Step 2: Update usePaneKeyboardNav to accept onOpenRecentSwitcher**

In `src/renderer/src/hooks/use-pane-keyboard-nav.ts`:

Update the function signature:

```typescript
interface PaneKeyboardNavOptions {
  onOpenRecentSwitcher: () => void
}

export function usePaneKeyboardNav({ onOpenRecentSwitcher }: PaneKeyboardNavOptions): void {
```

Inside the handler, add CMD+E handling (after the CMD+] block):

```typescript
      // Cmd+E: open recent task switcher
      if (e.key === 'e' && !e.shiftKey) {
        e.preventDefault()
        const mruList = store.getMruList()
        if (mruList.length === 0) return
        onOpenRecentSwitcher()
        return
      }
```

Update the useEffect dependency array to include `onOpenRecentSwitcher`:

```typescript
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [onOpenRecentSwitcher])
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 4: Manual test**

Run `pnpm dev`:
1. Click task A, then task B, then task C
2. Press CMD+E — switcher opens with B highlighted (most recent non-current)
3. Press E again (CMD still held) — A highlighted
4. Release CMD — navigates to A
5. Quick CMD+E then release — navigates to C (most recent)
6. Press CMD+E, then Escape — closes without navigating
7. With no history (fresh start), CMD+E does nothing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/hooks/use-pane-keyboard-nav.ts
git commit -m "feat: wire CMD+E shortcut to open RecentTaskSwitcher"
```

---

### Task 8: E2E Tests

**Files:**
- Create: `tests/navigation.spec.ts`

- [ ] **Step 1: Write back/forward E2E tests**

Create `tests/navigation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { launchApp } from './helpers/app'
import { createTask, clickTask } from './helpers/tasks'

let app: ElectronApplication
let page: Page

test.afterEach(async () => {
  if (app) {
    await app.close()
  }
})

test.describe('Back/Forward Navigation', () => {
  test('back and forward buttons navigate through history', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Back button should be enabled, forward disabled
    await expect(page.getByTestId('nav-back')).toBeEnabled()
    await expect(page.getByTestId('nav-forward')).toBeDisabled()

    // Go back to B
    await page.getByTestId('nav-back').click()
    await expect(page.locator('[data-task-id]').filter({ has: page.locator('[aria-selected="true"], .bg-accent') }).first()).toBeVisible()

    // Go back to A
    await page.getByTestId('nav-back').click()

    // Forward should now be enabled
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // Go forward to B
    await page.getByTestId('nav-forward').click()
  })

  test('CMD+[ and CMD+] work as back/forward shortcuts', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')

    // CMD+[ to go back
    await page.keyboard.press('Meta+[')
    // Should be back on Task A — verify back button is now disabled (stack empty)
    // and forward is enabled
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // CMD+] to go forward
    await page.keyboard.press('Meta+]')
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })

  test('new navigation clears forward stack', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Go back to B
    await page.keyboard.press('Meta+[')
    await expect(page.getByTestId('nav-forward')).toBeEnabled()

    // Navigate to a new task — forward should be cleared
    await clickTask(page, 'Task A')
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })

  test('buttons are disabled with no history', async () => {
    ;({ app, page } = await launchApp())

    await expect(page.getByTestId('nav-back')).toBeDisabled()
    await expect(page.getByTestId('nav-forward')).toBeDisabled()
  })
})

test.describe('CMD+E Recent Task Switcher', () => {
  test('opens and cycles through recent tasks', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')

    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // First item (Task B) should be highlighted
    const results = page.getByTestId('recent-task-result')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
    await expect(results.first()).toContainText('Task B')

    // Release CMD to commit
    await page.keyboard.up('Meta')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
  })

  test('does not open with no history', async () => {
    ;({ app, page } = await launchApp())

    await page.keyboard.press('Meta+e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
  })

  test('escape cancels without navigating', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // Escape to cancel
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()

    // Should still be on Task B (no navigation happened)
    await page.keyboard.up('Meta')
  })

  test('clicking an item navigates to it', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task A')
    await createTask(page, 'Task B')
    await createTask(page, 'Task C')

    await clickTask(page, 'Task A')
    await clickTask(page, 'Task B')
    await clickTask(page, 'Task C')

    // Open switcher
    await page.keyboard.down('Meta')
    await page.keyboard.press('e')
    await expect(page.getByTestId('recent-task-switcher-overlay')).toBeVisible()

    // Click Task A in the list
    const results = page.getByTestId('recent-task-result')
    await results.filter({ hasText: 'Task A' }).click()

    await expect(page.getByTestId('recent-task-switcher-overlay')).not.toBeVisible()
    await page.keyboard.up('Meta')
  })
})
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test`

Expected: All new and existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/navigation.spec.ts
git commit -m "test: add E2E tests for back/forward nav and CMD+E switcher"
```
