# Implementation Phases

## Phase 1 — Task Management (Testable: full todo app)

Goal: A working todo app with persistence. No Claude, no Git.

- Task list: create, edit, delete tasks with a description
- Sub-tasks up to 5 levels deep (collapsible tree)
- Task states: Idle and Done only (In Progress is introduced in Phase 3, driven by session lifecycle)
- "Mark as Done" transitions directly to Done (no confirmation dialog yet — that's added in Phase 3 when sessions exist)
- Clickable task list → navigates to task detail view (shows placeholder: "No active session")
- Description editable via hover icon
- Directory field on task (text input + native folder picker via `dialog:open-directory` IPC, no Git validation yet)
- Persist tasks/sub-tasks via electron-store across restarts

**Exit criteria:** You can create a task hierarchy, edit it, mark things done, and it survives a restart.

---

## Phase 2 — Git Directory Validation (Testable: directory assignment works)

Goal: The directory field becomes meaningful.

- Validate assigned directory is a Git repo (`git:validate-repo` IPC handler using simple-git)
- Show inline error if directory is not a Git repo or path doesn't exist
- Prevent saving invalid directory
- Sub-tasks inherit parent directory by default; surface the inherited/effective directory in the UI. The inheritance logic (resolve effective directory by walking up the parent chain) lives in the Zustand store so it's reusable when Phase 3 needs it for spawning sessions.

**Exit criteria:** Assigning a non-Git folder shows an error; assigning a real repo saves cleanly. Sub-tasks without an explicit directory show the inherited parent path.

---

## Phase 3 — Claude Code Terminal Sessions (Testable: full terminal loop)

Goal: Spawn and interact with a real Claude Code process inside the app.

### Setup

- Configure native module rebuilding for node-pty: add `@electron/rebuild` (or configure electron-vite's native module support) so node-pty compiles against Electron's Node headers. Verify the PTY can spawn a process before writing UI code.

### Implementation

- IPC handlers: `pty:spawn`, `pty:write`, `pty:resize`, `pty:kill`, `pty:data`
- Main process session map: `Map<string, IPty>` keyed by task ID (see tech_stack.md § Session Tracking)
- "Start Session" button on a task → resolves effective directory (own or inherited from parent) → spawns `claude` (or `CLAUDE_BIN`) via node-pty in that directory
- Embedded xterm.js terminal panel renders live output
- Introduce the In Progress state: task transitions to In Progress when a session starts; this state is runtime-only (not persisted)
- "Stop Session" kills the PTY, task returns to Idle
- "Mark as Done" now gets the confirmation dialog: if a session is active, prompt before killing PTY + marking done
- One active session per task/sub-task; multiple sessions across the hierarchy

**Exit criteria:** You can start a Claude Code session, type in it, stop it, and the task state updates correctly.

---

## Phase 4 — Diff Viewer (Testable: review panel with real diffs)

Goal: See actual Git diffs inside the app.

- IPC handlers: `git:diff-uncommitted` (working tree vs HEAD), `git:diff-branch` (current branch vs main/master), `git:detect-branch`
- Review panel tab alongside the terminal panel
- "Uncommitted Changes" mode: diff of working tree vs. HEAD
- "Branch vs. Main" mode: diff of current branch vs. main/master (auto-detected)
- Diff rendered with react-diff-view (unified view, grouped by file)
- Collapse/expand individual files
- Summary bar: files changed, lines added/removed
- Manual "Refresh" button to reload the diff (auto-refresh is deferred to Phase 6)

**Exit criteria:** With a dirty Git repo assigned to a task, the review panel shows the correct diffs in both modes.

---

## Phase 5 — Inline Comments + Submit to Claude (Testable: full feedback loop)

Goal: Complete the core review → feedback loop.

- Inline comment widget on diff lines (click line → add comment)
- Comments stored in Zustand comment pool (keyed by file path + line range)
- Comments persist across diff mode switches; hidden when file not in current view
- "Submit to Claude" button: serializes all pooled comments into the feedback format and writes to the active PTY session's stdin
- Helper text showing hidden comment count when applicable
- All comments deleted after submission
- Terminal auto-focuses after submission

**Exit criteria:** You can add comments in both diff modes, submit them, watch Claude receive the feedback in the terminal, and comments are cleared.

---

## Phase 6 — Polish & Stretch Goals

Goal: Sharpen the UX and add nice-to-haves.

- Keyboard shortcuts: start session, switch terminal/review, submit feedback (Req. 18)
- Markdown rendering in comment bodies (Req. 17)
- Auto-refresh diff after Claude writes to stdout (detect idle / debounce)
- Visual indicators for sessions active in sub-tasks (badge on parent)
- General UX cleanup: loading states, error boundaries, empty states
