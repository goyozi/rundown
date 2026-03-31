# Frameless Window + Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rundown window frameless on macOS and add a "Go to Task" command palette (⌘P) for quick cross-group task navigation.

**Architecture:** Two new renderer components (`TitleBar`, `GoToTask`) composed into the existing `App.tsx` layout. One small change to the Electron main process BrowserWindow options. No store changes — the palette reads existing task/group state and calls existing actions.

**Tech Stack:** React, TypeScript, Tailwind CSS, Zustand (read-only), Electron BrowserWindow API, Playwright (E2E tests).

---

## File Structure

| Action | File                                       | Responsibility                                                          |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| Modify | `src/main/index.ts:60-74`                  | Add `titleBarStyle: 'hidden'` + `trafficLightPosition` to BrowserWindow |
| Create | `src/renderer/src/components/TitleBar.tsx` | 36px drag bar with "Go to Task..." trigger                              |
| Create | `src/renderer/src/components/GoToTask.tsx` | Command palette overlay: input, search, results list                    |
| Create | `src/renderer/src/lib/task-search.ts`      | Pure function: multi-token fuzzy search + match highlighting            |
| Modify | `src/renderer/src/App.tsx`                 | Add `<TitleBar />` above two-pane layout, adjust flex direction         |
| Create | `tests/go-to-task.spec.ts`                 | E2E tests for the command palette                                       |

---

### Task 1: Frameless Window (Electron main process)

**Files:**

- Modify: `src/main/index.ts:60-74`

- [ ] **Step 1: Add frameless window options**

In `src/main/index.ts`, modify the BrowserWindow constructor options. Find this block (around line 63):

```typescript
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
```

Replace with:

```typescript
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 12 } }
      : {}),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: make window frameless on macOS with hidden title bar"
```

---

### Task 2: TitleBar Component

**Files:**

- Create: `src/renderer/src/components/TitleBar.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create TitleBar component**

Create `src/renderer/src/components/TitleBar.tsx`:

```tsx
import { Search } from 'lucide-react'

interface TitleBarProps {
  onGoToTask: () => void
}

export function TitleBar({ onGoToTask }: TitleBarProps): React.JSX.Element {
  return (
    <div className="h-9 flex items-center justify-center bg-sidebar-bg border-b border-border drag-region shrink-0 pl-[80px]">
      <button
        onClick={onGoToTask}
        className="no-drag flex items-center justify-between w-full max-w-[600px] mx-4 px-2.5 py-1 rounded-md bg-background/60 border border-border text-xs cursor-pointer hover:bg-background/80 transition-colors"
        data-testid="go-to-task-trigger"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Search className="size-3" />
          Go to Task…
        </span>
        <kbd className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
          ⌘P
        </kbd>
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Integrate TitleBar into App.tsx**

In `src/renderer/src/App.tsx`, add the import at the top with the other component imports:

```typescript
import { TitleBar } from './components/TitleBar'
```

Then find the return statement's outer div (around line 97):

```tsx
      <div className="flex h-screen w-screen bg-background">
```

Replace with:

```tsx
      <div className="flex flex-col h-screen w-screen bg-background">
        <TitleBar onGoToTask={() => {}} />
        <div className="flex flex-1 min-h-0">
```

And add a closing `</div>` before the existing closing `</div>` of the outer container. The full return block becomes:

```tsx
return (
  <TooltipProvider delayDuration={400}>
    <div className="flex flex-col h-screen w-screen bg-background">
      <TitleBar onGoToTask={() => {}} />
      <div className="flex flex-1 min-h-0">
        <aside
          className="flex-shrink-0 h-full bg-sidebar-bg border-r border-sidebar-border relative"
          style={{ width: sidebarWidth }}
        >
          <TaskList />
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onMouseDown={handleMouseDown}
            data-testid="sidebar-resize-handle"
          />
        </aside>
        <main className="flex-1 h-full min-w-0">
          <TaskDetail />
        </main>
      </div>
    </div>
  </TooltipProvider>
)
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/TitleBar.tsx src/renderer/src/App.tsx
git commit -m "feat: add TitleBar component with Go to Task trigger"
```

---

### Task 3: Task Search Logic

**Files:**

- Create: `src/renderer/src/lib/task-search.ts`

- [ ] **Step 1: Create the search module**

Create `src/renderer/src/lib/task-search.ts`:

```typescript
import type { Task, TaskGroup } from '@shared/types'

export interface SearchableTask {
  id: string
  groupId: string
  breadcrumb: string // "Group > Parent > Task"
  description: string
  state: Task['state']
}

export interface SearchResult {
  task: SearchableTask
  /** Indices into `breadcrumb` that matched, used for highlighting */
  matchedIndices: number[]
}

/**
 * Build a flat list of searchable tasks from the store state.
 * Each task gets a breadcrumb like "GroupName > ParentTask > ChildTask".
 */
export function buildSearchableList(tasks: Task[], groups: TaskGroup[]): SearchableTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const groupMap = new Map(groups.map((g) => [g.id, g]))

  return tasks.map((task) => {
    const parts: string[] = []

    // Build ancestor chain (child → root)
    let current: Task | undefined = task
    while (current) {
      parts.unshift(current.description)
      current = current.parentId ? taskMap.get(current.parentId) : undefined
    }

    // Prepend group name
    const group = groupMap.get(task.groupId)
    if (group) parts.unshift(group.name)

    return {
      id: task.id,
      groupId: task.groupId,
      breadcrumb: parts.join(' > '),
      description: task.description,
      state: task.state
    }
  })
}

/**
 * Multi-token partial-word search.
 * Each space-separated token must match somewhere in the breadcrumb (case-insensitive).
 * Returns matched results with character indices for highlighting.
 */
export function searchTasks(
  query: string,
  items: SearchableTask[],
  limit: number = 15
): SearchResult[] {
  const raw = query.trim()
  if (!raw) return items.slice(0, limit).map((task) => ({ task, matchedIndices: [] }))

  const tokens = raw.toLowerCase().split(/\s+/)

  const results: SearchResult[] = []

  for (const item of items) {
    const lower = item.breadcrumb.toLowerCase()

    // Check that every token matches somewhere
    let allMatch = true
    const matchedIndices: number[] = []
    const used = new Set<number>() // prevent double-matching same char

    for (const token of tokens) {
      let pos = 0
      let found = false
      // Find the first occurrence that doesn't overlap with already-matched chars
      while (pos <= lower.length - token.length) {
        const idx = lower.indexOf(token, pos)
        if (idx === -1) break
        // Check no overlap
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
      results.push({ task: item, matchedIndices })
    }
  }

  // Sort: tasks whose description starts with a matched token first,
  // then by breadcrumb length (shorter = higher). Tie-break alphabetical.
  const descStarts = new Set<string>()
  for (const token of tokens) {
    descStarts.add(token)
  }

  results.sort((a, b) => {
    const aDescLower = a.task.description.toLowerCase()
    const bDescLower = b.task.description.toLowerCase()
    const aStarts = tokens.some((t) => aDescLower.startsWith(t)) ? 0 : 1
    const bStarts = tokens.some((t) => bDescLower.startsWith(t)) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    if (a.task.breadcrumb.length !== b.task.breadcrumb.length) {
      return a.task.breadcrumb.length - b.task.breadcrumb.length
    }
    return a.task.breadcrumb.localeCompare(b.task.breadcrumb)
  })

  return results.slice(0, limit)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/task-search.ts
git commit -m "feat: add multi-token task search with match highlighting"
```

---

### Task 4: GoToTask Command Palette Component

**Files:**

- Create: `src/renderer/src/components/GoToTask.tsx`

- [ ] **Step 1: Create GoToTask component**

Create `src/renderer/src/components/GoToTask.tsx`:

```tsx
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { buildSearchableList, searchTasks } from '@/lib/task-search'
import { Check, Circle } from 'lucide-react'

interface GoToTaskProps {
  open: boolean
  onClose: () => void
}

export function GoToTask({ open, onClose }: GoToTaskProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { tasks, groups, activeGroupId, setActiveGroup, selectTask } = useTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      groups: s.groups,
      activeGroupId: s.activeGroupId,
      setActiveGroup: s.setActiveGroup,
      selectTask: s.selectTask
    }))
  )

  const searchableList = useMemo(() => buildSearchableList(tasks, groups), [tasks, groups])
  const results = useMemo(() => searchTasks(query, searchableList), [query, searchableList])

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlightIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const item = list.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, open])

  const navigateToTask = useCallback(
    (taskId: string, groupId: string) => {
      if (groupId !== activeGroupId) {
        setActiveGroup(groupId)
      }
      // setActiveGroup clears selectedTaskId, so we always call selectTask after
      // Use requestAnimationFrame to ensure the group switch has rendered
      requestAnimationFrame(() => {
        selectTask(taskId)
      })
      onClose()
    },
    [activeGroupId, setActiveGroup, selectTask, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const result = results[highlightIndex]
        if (result) {
          navigateToTask(result.task.id, result.task.groupId)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results, highlightIndex, navigateToTask, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
      data-testid="go-to-task-overlay"
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 w-full max-w-[600px]"
        style={{ top: 36 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-popover border border-border rounded-b-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Go to Task…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              data-testid="go-to-task-input"
            />
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto" role="listbox">
            {results.length === 0 && query.trim() && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching tasks
              </div>
            )}
            {results.map((result, index) => (
              <div
                key={result.task.id}
                role="option"
                aria-selected={index === highlightIndex}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm ${
                  index === highlightIndex ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
                onClick={() => navigateToTask(result.task.id, result.task.groupId)}
                onMouseEnter={() => setHighlightIndex(index)}
                data-testid="go-to-task-result"
              >
                {/* State icon */}
                {result.task.state === 'done' ? (
                  <Check className="size-3.5 text-success shrink-0" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                )}

                {/* Breadcrumb with highlighting */}
                <span className="flex-1 truncate text-muted-foreground">
                  <HighlightedBreadcrumb
                    text={result.task.breadcrumb}
                    matchedIndices={result.matchedIndices}
                  />
                </span>

                {/* State label */}
                <span className="text-xs text-muted-foreground/60 shrink-0 capitalize">
                  {result.task.state}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground/60">
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Enter</kbd> go to task
            </span>
            <span>
              <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">Esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function HighlightedBreadcrumb({
  text,
  matchedIndices
}: {
  text: string
  matchedIndices: number[]
}): React.JSX.Element {
  if (matchedIndices.length === 0) {
    return <>{text}</>
  }

  const matchSet = new Set(matchedIndices)
  const parts: React.JSX.Element[] = []
  let i = 0

  while (i < text.length) {
    if (matchSet.has(i)) {
      // Collect consecutive matched chars
      let end = i
      while (end < text.length && matchSet.has(end)) end++
      parts.push(
        <span key={i} className="text-primary font-medium">
          {text.slice(i, end)}
        </span>
      )
      i = end
    } else {
      let end = i
      while (end < text.length && !matchSet.has(end)) end++
      parts.push(<span key={i}>{text.slice(i, end)}</span>)
      i = end
    }
  }

  return <>{parts}</>
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/GoToTask.tsx
git commit -m "feat: add GoToTask command palette component"
```

---

### Task 5: Wire Up ⌘P Shortcut and GoToTask in App.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/TitleBar.tsx`

- [ ] **Step 1: Add GoToTask state and ⌘P handler to App.tsx**

In `src/renderer/src/App.tsx`, add the import:

```typescript
import { GoToTask } from './components/GoToTask'
```

Add state inside the `App` component, after the existing `isDragging` ref:

```typescript
const [goToTaskOpen, setGoToTaskOpen] = useState(false)
```

Add a ⌘P keyboard listener after the existing `useEffect` blocks (after the PTY exit listener):

```typescript
// Global ⌘P to open Go to Task palette
useEffect(() => {
  const handler = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.altKey) {
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      setGoToTaskOpen(true)
    }
  }
  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}, [])
```

Update the `<TitleBar>` to pass the real callback:

```tsx
<TitleBar onGoToTask={() => setGoToTaskOpen(true)} />
```

Add `<GoToTask>` right after `<TitleBar>`:

```tsx
<GoToTask open={goToTaskOpen} onClose={() => setGoToTaskOpen(false)} />
```

The full return block in App.tsx should now be:

```tsx
return (
  <TooltipProvider delayDuration={400}>
    <div className="flex flex-col h-screen w-screen bg-background">
      <TitleBar onGoToTask={() => setGoToTaskOpen(true)} />
      <GoToTask open={goToTaskOpen} onClose={() => setGoToTaskOpen(false)} />
      <div className="flex flex-1 min-h-0">
        <aside
          className="flex-shrink-0 h-full bg-sidebar-bg border-r border-sidebar-border relative"
          style={{ width: sidebarWidth }}
        >
          <TaskList />
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onMouseDown={handleMouseDown}
            data-testid="sidebar-resize-handle"
          />
        </aside>
        <main className="flex-1 h-full min-w-0">
          <TaskDetail />
        </main>
      </div>
    </div>
  </TooltipProvider>
)
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire up ⌘P shortcut and GoToTask into App layout"
```

---

### Task 6: E2E Tests

**Files:**

- Create: `tests/go-to-task.spec.ts`

- [ ] **Step 1: Write E2E tests**

Create `tests/go-to-task.spec.ts`:

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

async function createGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByTestId('new-group-button').click()
  await page.getByTestId('new-group-input').fill(name)
  await page.getByTestId('new-group-input').press('Enter')
}

async function switchToGroup(page: Page, name: string): Promise<void> {
  await page.getByTestId('group-selector-trigger').click()
  await page.getByText(name).click()
}

async function openGoToTask(page: Page): Promise<void> {
  await page.keyboard.press('Meta+p')
  await expect(page.getByTestId('go-to-task-overlay')).toBeVisible()
}

test.describe('Go to Task command palette', () => {
  test('opens with ⌘P and closes with Escape', async () => {
    ;({ app, page } = await launchApp())

    await openGoToTask(page)

    const input = page.getByTestId('go-to-task-input')
    await expect(input).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('opens by clicking the trigger', async () => {
    ;({ app, page } = await launchApp())

    await page.getByTestId('go-to-task-trigger').click()
    await expect(page.getByTestId('go-to-task-overlay')).toBeVisible()
  })

  test('searches and selects a task', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Fix login bug')
    await createTask(page, 'Add dashboard')

    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('login')

    const results = page.getByTestId('go-to-task-result')
    await expect(results).toHaveCount(1)
    await expect(results.first()).toContainText('Fix login bug')

    await page.keyboard.press('Enter')
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('navigates to task in different group', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Task in default group')

    await createGroup(page, 'Other Group')
    await createTask(page, 'Remote task')

    // Switch back to default group
    await switchToGroup(page, 'Rundown')
    await expect(page.locator('[data-task-description="Task in default group"]')).toBeVisible()

    // Use Go to Task to jump to the other group's task
    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('Remote')

    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toContainText('Remote task')
    await page.keyboard.press('Enter')

    // Should have switched groups and selected the task
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
    await expect(page.getByTestId('group-selector-trigger')).toHaveText(/Other Group/)
    await expect(page.locator('[data-task-description="Remote task"]')).toBeVisible()
  })

  test('multi-token search matches across group and task name', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Go to bar')

    await openGoToTask(page)
    await page.getByTestId('go-to-task-input').fill('Run Go')

    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toContainText('Go to bar')
  })

  test('closes when clicking backdrop', async () => {
    ;({ app, page } = await launchApp())

    await openGoToTask(page)

    // Click the backdrop (top-left corner, away from the dropdown)
    await page.getByTestId('go-to-task-overlay').click({ position: { x: 10, y: 400 } })
    await expect(page.getByTestId('go-to-task-overlay')).not.toBeVisible()
  })

  test('keyboard navigation through results', async () => {
    ;({ app, page } = await launchApp())

    await createTask(page, 'Alpha task')
    await createTask(page, 'Beta task')

    await openGoToTask(page)

    // First result should be highlighted by default
    const results = page.getByTestId('go-to-task-result')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')

    // Arrow down to second result
    await page.keyboard.press('ArrowDown')
    await expect(results.nth(1)).toHaveAttribute('aria-selected', 'true')

    // Arrow up back to first
    await page.keyboard.press('ArrowUp')
    await expect(results.first()).toHaveAttribute('aria-selected', 'true')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test:norebuild` (after a `pnpm build` if needed)

If any tests fail, fix the issues. Common things to watch for:

- Timing: may need `waitFor` on overlay visibility
- `Meta+p` may need to be `Control+p` on some CI environments

- [ ] **Step 3: Commit**

```bash
git add tests/go-to-task.spec.ts
git commit -m "test: add E2E tests for Go to Task command palette"
```

---

### Task 7: Final Build & Full Test Run

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass, including existing tests (no regressions) and new `go-to-task.spec.ts`.

- [ ] **Step 3: Verify visually**

Run: `pnpm dev`

Check:

- Window is frameless with traffic lights visible in top-left
- 36px drag bar visible across full width
- "Go to Task..." trigger is centered with ⌘P badge
- Window can be dragged by the title bar
- ⌘P opens the command palette
- Typing filters results with highlighted matches
- ↑↓ navigates, Enter selects, Esc closes
- Cross-group navigation works (switches group + selects task)
- Clicking backdrop closes the palette

- [ ] **Step 4: Final commit if any visual tweaks were needed**

```bash
git add -A
git commit -m "fix: visual polish for title bar and command palette"
```
