# Automatic Worktree Support — v2

## Overview

When the worktrees feature is enabled, tasks can run Claude Code and shell sessions in a dedicated git worktree instead of the original repo directory. Worktrees are ephemeral — they live and die with the task that owns them.

v2 introduces **per-task worktree mode** with inheritance, replacing the v1 model where the global setting was the sole control and individual tasks could only opt out of inheritance.

## Core Concepts

### Worktree Mode

Every task with a repo (assigned or inherited) has a **worktree mode**. The mode determines where CC and shell sessions run.

| Mode             | Meaning                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| **Inherit**      | Use whatever the nearest ancestor specifies. This is the default for all tasks. |
| **Own worktree** | This task (or its descendants) should run in a dedicated worktree.              |
| **No worktree**  | This task should run directly in the original repo directory — no isolation.    |

The **global setting** ("Default worktree mode") determines the system-wide default. It can be set to **Own worktree** or **No worktree**. Per-task mode always overrides the global default.

### Mode Resolution

To determine where a task runs, walk up the task tree:

1. If the task has an explicit mode set (**Own worktree** or **No worktree**), use it.
2. If the task is set to **Inherit**, check the parent. Repeat up the tree.
3. When walking ancestors, **unlocked (intent-only)** parents are **transparent** — they don't count as an inherited decision. This applies uniformly to both modes:
   - **Own worktree** without a created worktree → transparent.
   - **No worktree** without being locked → transparent.
     Only **locked** ancestors stop the walk: those with a concrete worktree (Created or auto-created on session start) or a locked No worktree.
4. If no ancestor has a concrete decision, fall back to the global default.

This means a parent's **locked No worktree** propagates to inheriting descendants, and a parent's **created worktree** is shared by inheriting descendants. But any unlocked intent (either mode) does **not** propagate — it only affects that task itself.

### Locking

A task's worktree mode becomes **locked** when any of:

- A **session starts** (CC launch or shell session) on the task, or
- The user explicitly **creates a worktree** for the task via the UI (the "Create" button), or
- The user explicitly **locks No worktree** via the UI (the "Lock" button).

Once locked, the mode cannot be changed. The dropdown disappears and the UI shows the resolved state. The lock can be cleared via the "Delete worktree" button (for owned worktrees) or the "×" clear button (for no-worktree locks).

Locking applies to the task itself. It does **not** lock descendants — they remain unlocked until they start their own sessions.

### Worktree Creation vs. Mode Setting

Setting a mode and **locking** it are two separate actions:

| Action                        | What happens                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set mode to **Own worktree**  | Records intent for this task only. No worktree on disk yet. Inheriting descendants see through this — it does not affect their resolved mode.                                                       |
| Set mode to **No worktree**   | Records intent for this task only. Inheriting descendants see through this — it does not affect their resolved mode.                                                                                |
| **Create** worktree (button)  | Creates the worktree on disk immediately. Locks the task to that specific worktree. Descendants that inherit now inherit this specific worktree.                                                    |
| **Lock** no worktree (button) | Locks the task to no worktree immediately. Descendants that inherit now inherit "no worktree".                                                                                                      |
| **Start session** on task     | If resolved mode is Own worktree and no worktree exists yet → creates one and locks. If resolved mode is No worktree → locks to no worktree. If inheriting a specific worktree → uses it and locks. |

This distinction enables key patterns:

- **Shared worktree (feature branch):** Set Own worktree on parent → click Create → all inheriting children share that one worktree.
- **Shared no-worktree:** Set No worktree on parent → click Lock → all inheriting children use the repo directly.
- **Parallel independent work:** Set global default to Own worktree (or set each child individually) → each child gets its own worktree when its session starts.

### Worktree Naming and Branching

Same as v1:

- **Location:** Configurable base directory, default `~/.rundown/worktrees/`.
- **Naming:** `{adjective}-{noun}-{shortId}` format (e.g. `brave-falcon-a3f2`). Adjective+noun from a controlled English dictionary. `shortId` is a truncated task ID.
- **Branch:** `worktree/{adjective}-{noun}-{shortId}`, branching from the repo's default branch (`main`/`master`).

### Inheritance Examples

#### Shared worktree (parent creates)

```
Group
└── Task A — mode: Own worktree, CREATED → brave-falcon-a3f2 (locked)
    ├── Subtask B — mode: Inherit → uses brave-falcon-a3f2 (locks on session start)
    │   └── Subtask D — mode: Inherit → uses brave-falcon-a3f2
    └── Subtask C — mode: No worktree (locks on session start) → uses original repo
```

#### Parallel worktrees (global default: Own worktree)

```
Global default: Own worktree
Group "UI tweaks"
└── Task A — mode: Inherit (no worktree on disk)
    ├── Subtask B — mode: Inherit → resolves to global default → starts session → gets own worktree calm-otter-b7e1 (locked)
    ├── Subtask C — mode: Inherit → resolves to global default → starts session → gets own worktree swift-hawk-c9d3 (locked)
    └── Subtask D — mode: Own worktree → starts session → gets own worktree bold-lynx-e4f5 (locked)
```

#### Mixed overrides (locked No worktree propagates)

```
Group
└── Task A — mode: No worktree, LOCKED
    ├── Subtask B — mode: Inherit → no worktree (locks on session start)
    ├── Subtask C — mode: Own worktree → starts session → gets own worktree (locked)
    │   └── Subtask E — mode: Inherit → uses C's worktree
    └── Subtask D — mode: Inherit → no worktree
```

#### Unlocked No worktree is transparent

```
Global default: Own worktree
Group
└── Task A — mode: No worktree (NOT locked — transparent to children)
    ├── Subtask B — mode: Inherit → resolves to global default → starts session → gets own worktree (locked)
    └── Subtask C — mode: Inherit → resolves to global default → starts session → gets own worktree (locked)
```

## UI

### Worktree Indicator

The worktree indicator is always visible on tasks that have a repo (assigned or inherited). Its appearance depends on the task's state:

#### Unlocked task, no worktree on disk

Shows a **dropdown** with three options:

- **Inherit** (default) — shows resolved effective mode in muted text, e.g. "Inherit → own worktree" or "Inherit → no worktree"
- **Own worktree** — next to this option (or next to the dropdown when selected), a **"Create"** button appears. Clicking it creates the worktree immediately and locks the task.
- **No worktree** — next to this option (or next to the dropdown when selected), a **"Lock"** button appears. Clicking it locks the task to no worktree immediately.

#### Unlocked task, inheriting a specific worktree from parent

Shows a **dropdown** with three options (same as above). Additionally shows the inherited worktree name in muted text, e.g. `→ brave-falcon-a3f2 (inherited)`.

Selecting **Inherit** and starting a session will lock to the inherited worktree. Selecting **Own worktree** and starting a session will create a new, separate worktree. Selecting **No worktree** and starting a session will use the repo directly.

#### Locked task, owns a worktree

Shows the **worktree name** (e.g. `brave-falcon-a3f2`) and a **"Delete worktree"** button.

No dropdown — mode cannot be changed.

#### Locked task, inherits a worktree

Shows the **worktree name** with an inherited indicator (e.g. `brave-falcon-a3f2 (inherited)`).

No dropdown, no delete button (the owning task manages the worktree).

#### Locked task, no worktree

Shows **"No worktree"** label and a small **"×" (clear) button** (only when no session is active).

No dropdown — mode cannot be changed until the lock is cleared.

Clicking the clear button shows a confirmation dialog:

- Changes made in the repository directory will **not** be reverted.
- The current Claude Code session will **not** be resumed.
- The task will revert to **unlocked, mode: Inherit**.

On confirm: clears `worktreeLocked`, resets `worktreeMode` to Inherit, clears `sessionId`. The dropdown reappears.

### Clearing a No-Worktree Lock

The "×" clear button is available on tasks that are **locked to no worktree** and have **no active session**. Clicking it:

1. Shows a confirmation dialog warning that:
   - Changes made in the repository directory will not be reverted.
   - The current Claude Code session will not be resumed.
2. On confirm:
   - Clears `worktreeLocked` and `lockedToWorktreeId`.
   - Resets `worktreeMode` to **Inherit**.
   - Clears `sessionId`.
   - The dropdown reappears and the user can pick a new mode.

### Deleting a Worktree

The "Delete worktree" button is available on tasks that **own** a worktree (not inherited) and have **no active session**. Clicking it:

1. Shows a confirmation dialog warning that:
   - The worktree directory and branch will be removed.
   - Uncommitted changes in the worktree will be lost.
   - Descendant tasks that inherited this worktree will be affected (their sessions will fail health checks on next resume).
2. On confirm:
   - Removes the worktree from disk (`git worktree remove --force`).
   - Deletes the branch (`git branch -D worktree/<name>`).
   - Removes the worktree record.
   - **Reverts the task to unlocked, mode: Inherit.** The dropdown reappears. The user can pick a new mode or start a new session.
3. The owning task's Claude Code session ID is cleared (the session was tied to the now-deleted worktree).
4. Descendant tasks that were locked to the deleted worktree:
   - Reverted to **unlocked, mode: Inherit**.
   - Their Claude Code session IDs are cleared.
   - They can now choose a new mode or start fresh.

## Lifecycle

### Session Start Flow

1. User launches CC or a shell session on a task.
2. **Resolve mode:** Walk up the tree per mode resolution rules.
3. Based on resolved state:

| Resolved state                                 | Action                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Inherits a **specific worktree** from ancestor | Health-check the worktree (see Session Resume). Launch in it. **Lock** the task.                    |
| Own worktree, **worktree exists** on task      | Health-check the worktree. Launch in it. (Task already locked.)                                     |
| Own worktree, **no worktree on disk**          | Create worktree (generate name, `git worktree add`, store record). Launch in it. **Lock** the task. |
| No worktree                                    | Launch in the original repo directory. **Lock** the task.                                           |

### Session Resume Flow (Health Check)

Same as v1. When launching on a task that is locked to a worktree:

1. **Directory exists?** Check the worktree path on disk.
2. **Valid worktree?** Confirm it appears in `git worktree list`.
3. **Branch exists?** Confirm the branch ref is valid.
4. All pass → launch in the worktree.
5. Any fail → **recreate** the worktree (same name/branch if possible) and notify the user. Uncommitted work may be lost.

### Cleanup Flow (Task Deletion)

1. User deletes a task.
2. Confirmation dialog warns about cascade: child tasks and their worktrees will be deleted.
3. Process each task in the deletion set (bottom-up):
   a. If the task **owns** a worktree:
   - `git worktree remove <path> --force`
   - `git branch -D worktree/<name>`
   - Remove worktree record.
     b. If the task inherits or uses main repo: no worktree cleanup.
4. Delete task records.

## Settings

| Setting               | Type                              | Default                 | Description                                                                                                               |
| --------------------- | --------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Default worktree mode | enum: Own worktree \| No worktree | No worktree             | System-wide default for tasks that resolve to Inherit with no ancestor override. Per-task overrides are always respected. |
| Worktree directory    | path                              | `~/.rundown/worktrees/` | Base directory for new worktrees. Changing only affects new worktrees.                                                    |

## Edge Cases

| Scenario                                                          | Behavior                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Repo deleted or moved externally                                  | Health check fails → error, prompt to reassign repo.                                                   |
| User changes global default to No worktree                        | Unlocked tasks now resolve to No worktree. Locked tasks unaffected.                                    |
| User changes global default to Own worktree                       | Unlocked tasks now resolve to Own worktree. Locked tasks unaffected.                                   |
| Task has no repo                                                  | No worktree indicator shown. CC cannot launch.                                                         |
| Worktree directory moved externally                               | Health check detects → recreate and notify.                                                            |
| Branch deleted externally                                         | Health check detects → recreate branch from default and notify.                                        |
| Parent sets Own worktree (intent, unlocked), child starts session | Parent's intent is transparent. Child resolves via global default. Parent remains unlocked.            |
| Parent sets No worktree (intent, unlocked), child starts session  | Parent's intent is transparent. Child resolves via global default. Parent remains unlocked.            |
| Parent creates worktree, child already locked to own              | No conflict — child keeps its own worktree. Only unlocked inheriting children are affected.            |
| Delete worktree while descendant sessions are active              | Active sessions continue (worktree still on disk until process exits). Next resume fails health check. |
| Task set to Own worktree, then user clicks Create, then deletes   | Reverts to unlocked Inherit. User can choose again.                                                    |
| Task locked to no worktree, user clicks clear                     | Reverts to unlocked Inherit. Session ID cleared. User can choose again.                                |

## Migration from v1

- Existing tasks with `inheritWorktree: false` and a worktree record → mode: Own worktree, locked, worktree record preserved.
- Existing tasks with `inheritWorktree: true` → mode: Inherit, unlocked (unless they have an active session, in which case locked).

## Test Scenarios

### Mode Setting & Locking

1. **Default mode:** New task → mode is Inherit, unlocked, dropdown visible.
2. **Set Own worktree:** Select Own worktree from dropdown → mode recorded, still unlocked, Create button visible.
3. **Set No worktree:** Select No worktree → mode recorded, still unlocked, Lock button visible.
4. **Lock on session start (own):** Set Own worktree, start CC → worktree created, task locked, dropdown disappears.
5. **Lock on session start (no worktree):** Set No worktree, start CC → runs in repo, task locked, dropdown disappears.
6. **Lock on Create button:** Set Own worktree, click Create → worktree created on disk, task locked immediately.
7. **Lock on Lock button:** Set No worktree, click Lock → task locked immediately, dropdown disappears.
8. **Cannot change mode once locked:** Locked task → no dropdown, mode label only.

### Inheritance

9. **Inherit resolves to global default:** No ancestors with explicit mode, global enabled → resolves to Own worktree.
10. **Inherit resolves to parent (locked No worktree):** Parent locked to No worktree → child inherits No worktree.
11. **Inherit resolves to parent (concrete worktree):** Parent Created a worktree → child inherits that specific worktree.
12. **Override parent:** Parent is locked No worktree, child selects Own worktree → child gets its own worktree on session start.
13. **Deep inheritance:** A (Own worktree, created) → B (Inherit) → C (Inherit) → all use A's worktree.
14. **Chain break:** A (Own worktree, created) → B (No worktree, locked) → C (Inherit) → C uses no worktree.
15. **Intent-only Own worktree transparent:** A (Own worktree, NOT created) → B (Inherit) → B resolves to global default, NOT to A's intent.
16. **Intent-only No worktree transparent:** A (No worktree, NOT locked) → B (Inherit) → B resolves to global default, NOT to A's mode.
17. **Intent-only with grandparent concrete:** A (Own worktree, created) → B (Own worktree, NOT created) → C (Inherit) → C uses A's worktree (B's intent is transparent).
18. **No worktree intent-only with grandparent concrete:** A (Own worktree, created) → B (No worktree, NOT locked) → C (Inherit) → C uses A's worktree (B's intent is transparent).

### Shared vs. Independent Pattern

19. **Shared worktree pattern:** Parent sets Own worktree, clicks Create → children inherit that specific worktree, all share it.
20. **Shared no-worktree pattern:** Parent sets No worktree, clicks Lock → children inherit no worktree.
21. **Independent pattern (global default):** Global default is Own worktree, no explicit modes → each child gets its own worktree on session start.
22. **Mixed:** Parent sets Own, creates. Child A inherits (shared). Child B sets Own (gets independent worktree on session start).

### Worktree Deletion

23. **Delete own worktree:** Click Delete on owning task → worktree removed, branch deleted, task reverts to unlocked Inherit, dropdown reappears.
24. **Delete with inheriting descendants:** Delete worktree → descendants locked to that worktree reverted to unlocked Inherit, their session IDs cleared. They can start fresh.
25. **Delete clears session IDs:** Delete worktree → owning task's session ID cleared, all descendants locked to it have session IDs cleared.
26. **Delete then re-create:** Delete worktree → pick Own worktree again → click Create → new worktree, new name, locked again.
27. **Delete then switch to no worktree:** Delete worktree → select No worktree → start session → locked to no worktree.
28. **Cannot delete inherited worktree:** Task inheriting from parent → no Delete button shown.

### No-Worktree Lock Clearing

29. **Clear no-worktree lock:** Task locked to no worktree, no session active → click × → confirm → reverts to unlocked Inherit, dropdown reappears.
30. **Clear button hidden during session:** Task locked to no worktree with active session → no × button shown.
31. **Clear then start with worktree:** Clear no-worktree lock → select Own worktree → start session → gets worktree, locked.

### Session Resume

32. **Normal resume:** Locked to worktree, close and reopen → same worktree reused.
33. **Directory deleted externally:** Worktree dir gone → health check fails → recreated, user notified.
34. **Branch deleted externally:** Branch gone → recreated from default, user notified.

### Settings Interaction

35. **Global default No worktree:** Unlocked tasks with no ancestor override resolve to No worktree.
36. **Global default Own worktree:** Unlocked tasks with no ancestor override resolve to Own worktree.
37. **Per-task override beats global:** Global is No worktree, task explicitly set to Own worktree → task gets worktree.
38. **Change worktree directory:** Only affects newly created worktrees.

### UI States

39. **Unlocked, no worktree on disk:** Dropdown with Inherit / Own worktree / No worktree. Inherit shows resolved effective mode. Create button for Own worktree, Lock button for No worktree.
40. **Unlocked, inheriting specific worktree:** Dropdown + inherited worktree name shown.
41. **Locked, owns worktree:** Worktree name + Delete button. No dropdown.
42. **Locked, inherits worktree:** Worktree name + "(inherited)". No dropdown, no delete.
43. **Locked, no worktree:** "No worktree" label + × clear button (when no session active). No dropdown.
44. **Locked, no worktree, session active:** "No worktree" label only. No × button, no dropdown.
