# Frameless Window + Command Palette ("Go to Task")

## Overview

Make the Rundown window frameless on macOS and add a "Go to Task" command palette (⌘P) in a new top drag bar, enabling quick navigation to any task across all groups.

## 1. Frameless Window (macOS only)

### Electron BrowserWindow changes

- Set `titleBarStyle: 'hidden'` — removes the title bar, keeps native macOS traffic lights
- Set `trafficLightPosition: { x: 16, y: 12 }` — centers lights vertically in the 36px drag bar
- Platform-gated: only apply on `process.platform === 'darwin'`. Other platforms keep the standard title bar.

### Drag region

- A new 36px `TitleBar` component spans the full window width at the top
- Entire bar is `-webkit-app-region: drag`
- Interactive elements inside (the input trigger) are `-webkit-app-region: no-drag`

## 2. TitleBar Component

**File:** `src/renderer/src/components/TitleBar.tsx`

**Layout:**
- 36px height, `--sidebar-bg` background, bottom border with `--border`
- Centered "Go to Task..." trigger, max-width 600px
- Left padding (~80px) to avoid overlapping traffic lights

**Idle state:**
- Styled div (not a real input) with:
  - "Go to Task..." placeholder, left-aligned, `--muted-foreground` color
  - `⌘P` keyboard badge, right-aligned, `--secondary` color
- Click opens the command palette

**App.tsx integration:**
- `<TitleBar />` rendered above the existing two-pane flex container
- Outer layout becomes `flex flex-col h-screen`, two-pane area takes `flex-1`

## 3. Command Palette (GoToTask)

**File:** `src/renderer/src/components/GoToTask.tsx`

### Trigger

- `⌘P` globally — `keydown` listener on capture phase
- Click on the trigger div in the title bar
- Disabled when a dialog/modal is open

### Overlay structure

- Fixed-position overlay with semi-transparent backdrop (click to dismiss)
- Dropdown panel directly below the title bar, horizontally centered, max-width 600px
- Top: real `<input>`, auto-focused, focus ring using `--ring`
- Middle: scrollable results list, max 15 results
- Bottom: footer with keyboard hints (↑↓ navigate, Enter go to task, Esc close)

### Search & matching

- Collects all tasks across all groups, flattened (including nested children)
- Each entry rendered as breadcrumb: `Group > Parent > ... > Task`
- Input split by spaces into tokens
- Each token must match somewhere in the breadcrumb string (partial word, case-insensitive)
- Example: "Run G" → "run" matches "Rundown", "g" matches "Go to bar..."
- Matched characters highlighted in `--primary`
- Results sorted by: tasks whose description starts with a matched token first, then by breadcrumb length (shorter = higher). Tie-break by alphabetical breadcrumb.
- No debounce — filtering a flat in-memory list is instant

### Result items

- Left: task state icon (checkmark in `--success` for done, circle in `--muted-foreground` for idle)
- Center: breadcrumb path with match highlighting
- Right: state label ("Done" / "Idle") in `--muted-foreground`
- First result auto-highlighted

### Selection behavior

- Enter or click: switch `activeGroupId` if needed, call `selectTask(taskId)`, close palette
- Esc or click backdrop: close, no navigation

## 4. Integration

### Store changes

None. Reads existing state (`tasks`, `groups`, `activeGroupId`, `rootTaskOrder`) and calls existing actions (`setActiveGroup()`, `selectTask()`).

### Keyboard shortcut integration

- `⌘P` handler in `GoToTask` component, registered on capture phase
- Existing `use-pane-keyboard-nav` and `use-task-keyboard-nav` hooks unchanged
- When palette is open, it captures all keyboard input — existing shortcuts effectively blocked by focused input

### Electron main process

- Add `titleBarStyle: 'hidden'` and `trafficLightPosition` to BrowserWindow options in `src/main/index.ts`
- Gated behind `process.platform === 'darwin'`

### New dependencies

None.

## 5. Visual Reference

Mockups saved in `.superpowers/brainstorm/` during design session:
- `layout-overview-v4.html` — idle state with 36px drag bar
- `command-palette-active-v2.html` — active state with results dropdown using app palette colors

## 6. Scope Boundaries

**In scope:**
- Frameless window on macOS
- TitleBar component with drag region
- GoToTask command palette (⌘P)
- Multi-token partial word search across all groups
- Keyboard navigation (↑↓, Enter, Esc)
- Auto-switch group on cross-group navigation

**Out of scope:**
- Non-macOS frameless window support
- Command palette actions beyond task navigation (no "run command" features)
- Persisted search history or recent tasks
- Custom keyboard shortcut configuration
