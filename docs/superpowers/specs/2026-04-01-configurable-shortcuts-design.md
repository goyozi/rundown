# Configurable Shortcuts

Global icon buttons in the title bar that execute shell commands or Claude prompts into the active task's terminal.

## Motivation

Users want quick-access buttons for common operations like git pull, creating PRs, or running tests — without leaving the terminal-oriented workflow. Shortcuts bridge the gap between IDE convenience and terminal power.

## Data Model

```ts
type Shortcut = {
  id: string // crypto.randomUUID()
  name: string // display name, e.g. "Git Pull"
  icon: string // lucide icon name, e.g. "git-pull-request"
  type: 'shell' | 'claude'
  command: string // the text to send to the terminal
  order: number // sort position (0-based)
}
```

Stored in a new `ShortcutSlice` in the Zustand store, persisted to electron-store following the same pattern as existing slices (debounced IPC persistence).

## Title Bar Layout

The title bar gains a shortcuts area on the right side:

```
[          "Go to... / Run..."  ⌘P          ]  [+] [🔀] [📤] [▶]
 ← drag region / search bar →                   ↑    ← shortcuts →
                                            add button
```

- **+ button (empty state)**: when no shortcuts exist, displays as a visible button with border, blue-violet accent tint, and a "+ Add shortcut" label. Discoverable and inviting for first-time users.
- **+ button (has shortcuts)**: once the user has at least one shortcut, collapses to a minimal borderless gray plus icon at low opacity (~35%). Hover brightens slightly. They already know about the feature — style over discoverability.
- **Shortcut buttons**: 26×26px, subtle `bg-background/60` with `border-border`, matching the existing title bar aesthetic. Tooltip shows the shortcut name on hover.
- **Overflow**: the search bar has higher z-index. If shortcuts overflow, they tuck behind the search bar. No cap on shortcut count.

The search bar placeholder text changes from "Go to Task…" to "Go to... / Run...".

## Add / Edit Dialog

A shadcn `Dialog` matching the `SettingsDialog` patterns:

- `DialogContent` with `sm:max-w-[440px]`
- `DialogHeader` + `DialogTitle` ("Add Shortcut" or "Edit Shortcut")
- `space-y-5 py-2` layout

### Fields

1. **Name** — shadcn `Input`, `text-sm`
2. **Type** — inline toggle group (same pattern as theme selector in SettingsDialog): two buttons in a rounded border, `bg-accent` for active state. Options: "Shell command" / "Claude prompt"
3. **Command** — shadcn `Input` with `text-xs font-mono`
4. **Icon picker**:
   - Search `Input` at the top with placeholder "Search icons..."
   - Below: a grid of icon buttons (8 columns, 36×36px each)
   - Default state (no search): shows ~20 curated common icons (git-branch, git-pull-request, play, terminal, rocket, upload, download, refresh-cw, wrench, settings, shield, square-terminal, etc.)
   - When searching: filters the full lucide-react icon set by name
   - Selected icon highlighted with `bg-accent`
5. **Buttons** — Cancel (`variant="outline"`) and Add/Save (`variant="default"`)

Edit mode reuses the same dialog, pre-populated with existing values.

## Execution Flow

When a shortcut button is clicked (or selected from the command palette):

1. **Check for active task** — if no task is selected, do nothing.
2. **Determine target tab** based on shortcut `type`:
   - `shell` → the active shell tab of the selected task
   - `claude` → the Claude session tab of the selected task
3. **If no session/tab exists** → auto-start it (same logic as clicking "Start Session" or opening a shell tab)
4. **Wait 2 seconds** (only if a new session/tab was started in step 3) — fixed delay for the session to become ready. If the session was already running, send immediately.
5. **Write command + newline** into the pty via the existing `ptyWrite` IPC channel.

No new IPC channels needed. The delay is a simple `setTimeout` — we can make it smarter later if needed.

## Drag-and-Drop Reordering

Uses `@dnd-kit` (already a project dependency) with `horizontalListSortingStrategy`:

- Each shortcut button is wrapped in `useSortable`
- Drag overlay shows the icon at slight scale
- On drop, the `order` fields are updated in the store
- Same activation constraint as the task tree (5px pointer distance)

## Context Menu

Right-clicking a shortcut button shows a shadcn `ContextMenu` (same components as `TaskItem`):

- **Edit** — opens the Add/Edit dialog pre-populated
- **Delete** — removes the shortcut immediately (no confirmation needed for such a lightweight item)

## Command Palette Integration

The existing command palette (⌘P) is extended to search shortcuts alongside tasks:

- **Results display**: tasks and shortcuts shown together. Shortcuts are distinguished by their configured icon and a subtle "Run" label or visual differentiation (e.g. muted badge).
- **Ordering**: tasks first, then shortcuts. Both filtered by the search query matching against their names.
- **Selecting a shortcut**: executes it (same flow as clicking the title bar button).
- **Selecting a task**: navigates to it (existing behavior, unchanged).

## Storage

Shortcuts are persisted via the same mechanism as other Zustand slices:

- Renderer → IPC → electron-store (debounced writes)
- Loaded on app startup alongside tasks and settings
- A new IPC channel pair for shortcut persistence: `SHORTCUTS_LOAD` / `SHORTCUTS_SAVE`

## Scope Exclusions

- No per-project shortcuts (global only)
- No keyboard shortcuts for individual shortcut buttons
- No confirmation before execution
- No execution history or output capture
- No variable interpolation in commands (e.g. `${branch}`)
- No smart readiness detection (fixed 2s delay only)
