# Back/Forward Navigation & Recent Task Switcher

## Overview

Add browser-style back/forward navigation and an alt-tab-style recent task switcher (CMD+E) to Rundown. These are two independent features that share a common integration point: all user-initiated task navigation flows through a new `navigateToTask()` function that updates both history stacks and the MRU list.

## Features

### 1. Back/Forward Navigation

Browser-style history stack. Every task selection (sidebar click, Go to bar, keyboard nav, CMD+E) pushes to the back stack. Navigating to a new task clears the forward stack.

**Buttons**: Two chevron buttons (ChevronLeft / ChevronRight) in the title bar, placed between the traffic lights and the Go to bar. The title bar's left padding increases from 80px to ~130px.

**Keyboard shortcuts**: CMD+[ (back), CMD+] (forward) — standard macOS conventions.

**Button states**: Enabled when the corresponding stack is non-empty (visible icon, hover highlight). Disabled when empty (dimmed, no interaction). Tooltips show the shortcut.

**Cross-group**: Back/forward works across task groups. Navigating back to a task in a different group automatically switches the active group.

### 2. CMD+E Recent Task Switcher

Alt-tab-style MRU (most recently used) cycling. Shows a dropdown of recently visited tasks. Holding CMD and pressing E repeatedly cycles through the list. Releasing CMD commits the selection.

**Interaction model**:
- CMD+E: open switcher, highlight first item (most recent non-current task)
- E (CMD held): advance highlight to next item
- CMD+Shift+E (CMD held): move highlight backwards
- Release CMD: commit — navigate to highlighted task, close switcher
- Escape (CMD held): cancel — close without navigating
- Click an item: navigate immediately, close
- Click outside: cancel
- Wrap-around: cycling past the end wraps to the beginning

**UI**: Same overlay style as GoToTask but without a search input. Shows task name and group breadcrumb for each entry. Highlighted item has a distinct selection background/ring.

## Data Model

### NavigationSlice

New Zustand slice added to the store alongside existing slices.

```typescript
interface NavigationEntry {
  taskId: string
  groupId: string
}

interface NavigationSlice {
  // Back/forward (browser-style)
  backStack: NavigationEntry[]
  forwardStack: NavigationEntry[]

  // MRU (alt-tab style)  
  mruList: NavigationEntry[]

  // Actions
  navigateToTask: (taskId: string, groupId?: string) => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getMruList: () => NavigationEntry[]
}
```

**Stack limits**: back/forward stacks capped at 100 entries. MRU list capped at 10.

**State lifetime**: In-memory only, not persisted. Resets on app restart.

### navigateToTask(taskId, groupId?)

Called by all user-initiated navigation (replaces direct `selectTask` calls):

1. If `taskId` equals the currently selected task: no-op
2. If a task is currently selected, push current `{taskId, groupId}` onto `backStack` (skip if `selectedTaskId` is null)
3. Clear `forwardStack`
4. Move target task to front of `mruList` (insert if new, cap at 10)
5. If `groupId` differs from active group: call `setActiveGroup(groupId)`
6. Call `selectTask(taskId)` — with `requestAnimationFrame` delay if group changed

### goBack() / goForward()

1. Pop from the source stack (back or forward)
2. Push current onto the other stack
3. Skip entries for deleted tasks (check if task still exists)
4. Move target to front of `mruList`
5. Switch group if needed, then `selectTask`

## Integration

### Call site migration

Replace direct `selectTask(id)` calls with `navigateToTask(id, groupId)`:

| Location | Current | Change |
|----------|---------|--------|
| `GoToTask.tsx` | `setActiveGroup` + `selectTask` | `navigateToTask(taskId, groupId)` |
| `TaskItem.tsx` | `selectTask(task.id)` | `navigateToTask(task.id, activeGroupId)` |
| `use-pane-keyboard-nav.ts` | `selectTask` via CMD+Up/Down/J/K | `navigateToTask(taskId, activeGroupId)` |
| `use-task-keyboard-nav.ts` | `selectTask` via j/k | `navigateToTask(taskId, activeGroupId)` |

`selectTask` remains as the low-level setter in TaskSlice. Only the navigation system calls it internally.

### New keyboard shortcuts

Registered in `use-pane-keyboard-nav.ts` (capture phase, works even with xterm focused):

- CMD+[ → `goBack()`
- CMD+] → `goForward()`
- CMD+E → open `RecentTaskSwitcher` (state managed in App.tsx, same pattern as GoToTask). No-op if MRU list is empty (fresh launch, no navigation history).

### New components

**`NavButtons.tsx`**: Back/forward chevron buttons. Reads `canGoBack()`/`canGoForward()` from store. Rendered in TitleBar between traffic light padding and Go to bar.

**`RecentTaskSwitcher.tsx`**: CMD+E overlay. Reads `getMruList()` from store. Manages keydown/keyup lifecycle:
- `keydown` Meta: marks CMD as held
- `keydown` E (while CMD held): open switcher or advance highlight
- `keydown` Shift+E (while CMD held): move highlight backwards
- `keyup` Meta: commit selection, close
- `blur` event on window: treat as commit (handles CMD held when window loses focus)

### TitleBar changes

- Import and render `NavButtons` between the left padding and the Go to bar
- Increase `pl-[80px]` to ~`pl-[130px]` to accommodate the buttons

### Group switching

`setActiveGroup` currently clears `selectedTaskId`. `navigateToTask` handles this by calling `selectTask` after `setActiveGroup` with a `requestAnimationFrame` delay — the same pattern GoToTask already uses.

## Testing

- **Unit tests** (vitest): NavigationSlice logic — back/forward stack manipulation, MRU ordering, duplicate prevention, stack caps, deleted task filtering, cross-group entries
- **E2E tests** (Playwright): back/forward button clicks, CMD+[/] shortcuts, CMD+E open/cycle/commit/cancel, cross-group navigation
