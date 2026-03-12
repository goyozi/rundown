# Rundown — MVP Scope

## Overview

A local desktop app that combines a todo list, terminal-based Claude Code sessions, and a GitHub-style code review interface into a single workflow. The user manages coding tasks, launches Claude Code against specific directories, reviews the resulting changes inline, and feeds review comments back to Claude — all without leaving the app.

---

## Core Concepts

- **Task**: A todo item with an optional linked Git repository directory. Tasks can have nested sub-tasks up to 5 levels deep.
- **Session**: A running Claude Code terminal instance tied to a task (or sub-task). One active session per task/sub-task at a time, but multiple sessions can coexist across different levels of the hierarchy.
- **Review**: A diff-based view of changes in the task's directory, with inline commenting. Supports two diff modes.
- **Feedback Loop**: The cycle of reviewing changes → writing comments → submitting them directly to the Claude Code session → reviewing again.

---

## User Flows

### 1. Task Management

1. User opens the app and sees a list of tasks.
2. User creates a new task by entering a short description.
3. User assigns a local directory to the task via a folder picker or by pasting a path. The directory **must be a Git repository** — if it is not, the app shows an error and rejects the selection.
4. Tasks persist across app restarts.
5. User can edit a task's description or directory at any time (only when no session is active on that task).
6. User can delete a task. If a session is running, the app prompts to kill it first.

#### Sub-Tasks

- Any task can have nested sub-tasks, up to 5 levels deep.
- Sub-tasks inherit the parent's directory by default but can override it with a different Git directory.
- Each sub-task is independently startable — it gets its own Claude Code session and its own review context.
- Multiple sessions can be active simultaneously across different tasks/sub-tasks in the hierarchy (but only one session per individual task or sub-task).

#### Task States

- **Idle** — created, no active session.
- **In Progress** — a Claude Code session is active. The user freely switches between the terminal and the review view within this state. This state is runtime-only and not persisted — on restart, tasks revert to Idle or Done since sessions don't survive restarts.
- **Done** — user has manually marked the task complete. If a session is still running, a confirmation dialog asks whether to stop the session as well.

#### Task List Interaction

- Tasks in the list are **clickable**. Clicking a task navigates to its session view.
  - If the task has an active session, the app shows the terminal/review panel for that session.
  - If the task has no active session, the app shows a placeholder screen (e.g., "No active session — click Start Session to begin").
- Task descriptions are **not** inline-editable by default. A small edit icon appears on hover, which opens the description for editing.
- Sub-tasks follow the same interaction: clicking navigates to the sub-task's own session context.

### 2. Starting a Claude Code Session

1. From a task or sub-task in **Idle** or **Done** state, the user clicks "Start Session."
2. The app spawns a Claude Code process in the task's assigned directory.
3. An embedded terminal panel appears, showing the live Claude Code session.
4. The task transitions to **In Progress**.
5. The user interacts with Claude Code normally — no prompt pre-filling in the MVP.

### 3. Reviewing Changes

1. At any point while a session is active, the user switches to a "Review" panel for that task.
2. The user selects a diff mode (see § Diff Modes below).
3. Changes are displayed in a GitHub-style diff viewer, grouped by file.
4. For each file, the user can:
   - View the full diff (added/removed/modified lines).
   - Add inline comments on specific lines or line ranges.
   - Collapse or expand individual files.
5. A summary panel shows the total number of files changed and lines added/removed.

### 4. Sending Feedback to Claude

1. User adds inline comments on the diff.
2. User clicks "Submit to Claude."
3. The app serializes **all pooled comments** (including those hidden in the other diff mode) into a structured text block (file path + line number + comment body) and writes it to the active Claude Code session's stdin.
4. If any comments are currently hidden (because their file is not in the active diff view), a small helper text appears beneath the submit button: e.g., *"All 7 comments will be submitted (3 hidden in current view)."*
5. The terminal panel becomes focused so the user can watch Claude respond.
6. All comments are deleted immediately after submission. They are ephemeral — they exist only to compose the feedback message and are discarded once sent.

### 5. Iterating

1. After Claude applies changes, the user switches back to the Review panel.
2. The diff refreshes via a manual "Refresh" button (auto-refresh is a Phase 6 stretch goal) reflecting the new state of the working directory.
3. The user adds new comments and submits again.
4. This loop continues until the user is satisfied.

### 6. Stopping a Session

1. User clicks "Stop Session."
2. The app sends a termination signal to the Claude Code process and waits for a graceful exit (with a force-kill timeout).
3. The terminal panel closes.
4. The task returns to **Idle** state — it is not automatically marked as done.

### 7. Completing a Task

1. User clicks "Mark as Done" on a task (or sub-task).
2. If a session is currently running, a confirmation dialog appears: *"A session is still active. Stop the session and mark as done?"*
   - **Yes** — the session is killed and the task moves to **Done**.
   - **Cancel** — no action taken.
3. If no session is running, the task moves directly to **Done**.

---

## Diff Modes

The review panel offers two diff modes, toggled via a selector:

### Uncommitted Changes
- Shows the diff between the current working tree and the last Git commit (`HEAD`).
- Useful for reviewing work-in-progress before Claude (or the user) commits.

### Branch vs. Main
- Shows the diff between the current branch HEAD and the `main` or `master` branch (auto-detected, with `main` preferred if both exist).
- Useful for reviewing the full scope of the feature branch, including already-committed work.
- Includes both committed and uncommitted changes on the current branch.

---

## Comment Model

- Comments are **ephemeral** in the sense that they are not persisted long-term or tracked with statuses. They exist as draft annotations while the user composes feedback and are deleted on submission.
- A comment is attached to a specific file path and line range.
- Comments have a plain text body (no markdown rendering in MVP).
- On "Submit to Claude," **all** comments across the pool are serialized, sent, and then **deleted**. There is no comment history or resolution tracking.
- Comments live in a **shared pool** across diff modes. Switching between "Uncommitted" and "Branch vs. Main" does **not** discard comments. If a commented file is not visible in the current diff mode, the comment is simply hidden from view but remains in the pool. It will reappear when switching to a mode where that file is visible, and it will be included when feedback is submitted regardless of which diff mode is active at submission time.

---

## Feedback Serialization Format

When comments are submitted, they are formatted as a readable, prompt-friendly block piped into the Claude Code session. Example:

```
Here is my review feedback on the current changes:

## src/utils/parser.ts (lines 14-18)
This logic doesn't handle the case where the input is an empty array.
Please add a guard clause.

## src/components/App.tsx (line 42)
Rename this variable to something more descriptive than `d`.

## src/index.ts (line 3)
Remove this unused import.
```

The exact format can be tuned, but it should be human-readable and useful as a Claude prompt.

---

## Requirements Summary

### Must Have (MVP)

| # | Requirement |
|---|-------------|
| 1 | Create, edit, delete todo tasks with a description and assigned local directory. |
| 2 | Directory validation — must be a Git repository, show error otherwise. |
| 3 | Sub-task support up to 5 levels of nesting, each independently sessionable. Sub-tasks inherit parent directory by default, with optional override. |
| 4 | Task state management (Idle → In Progress → Done). |
| 5 | Clickable task list — clicking navigates to the task's session view (or a "no active session" placeholder). Description editable via hover icon. |
| 6 | Launch a Claude Code terminal session scoped to a task's directory. |
| 7 | One active session per task/sub-task; multiple sessions allowed across the hierarchy. |
| 8 | Embedded terminal view showing the live Claude Code session. |
| 9 | Stop a running session without marking the task as done. |
| 10 | "Mark as Done" with confirmation dialog to optionally stop an active session. |
| 11 | Git-based diff viewer with two modes: uncommitted changes and branch vs. main/master. |
| 12 | Auto-detection of main vs. master branch. |
| 13 | Inline commenting on specific file lines within the diff view. |
| 14 | Comments persist across diff mode switches in a shared pool; hidden when their file is not in the active view. |
| 15 | "Submit to Claude" — serialize all pooled comments and pipe into the terminal session, then delete all comments. Show helper text with hidden comment count when applicable. |
| 16 | Task and sub-task data persisted locally across app restarts. |

### Nice to Have (MVP Stretch)

| # | Requirement |
|---|-------------|
| 17 | Markdown rendering in comments. |
| 18 | Keyboard shortcuts for common actions (start session, switch to review, submit feedback). |

### Explicitly Out of Scope

- User authentication or multi-user support.
- Claude Code installation or configuration — assumed pre-installed.
- Prompt pre-filling or template management.
- Git operations (commit, push, branch) from within the app.
- Remote repository management.
- Cloud sync of tasks or sessions.
- Session persistence / reattachment across app restarts.
- Comment history, resolution tracking, or persistence after submission.

---

## Open Questions

None — all resolved.
