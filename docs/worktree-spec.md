# Automatic Worktree Support

## Overview

When the worktrees feature is enabled, launching a Claude Code session on a task automatically creates a dedicated git worktree. CC operates in that worktree instead of the original repo directory. Worktrees are ephemeral — they live and die with the task that owns them.

## Core Concepts

### Worktree Creation

- **Trigger:** First CC launch **or shell session start** on a task that has a git repo assigned (directly or inherited) and no existing worktree. Shell sessions (ephemeral shells opened in a task's repo) follow the same worktree creation, inheritance, and health check logic as CC launches.
- **Location:** Configurable base directory, default `~/rundown/worktrees/`. Changeable in Settings.
- **Naming:** `{adjective}-{noun}-{shortId}` format (e.g. `brave-falcon-a3f2`).
  - Adjective+noun from a controlled English dictionary (avoids i18n issues).
  - `shortId` is a truncated task ID for uniqueness and traceability.
- **Branch:** A new branch is auto-created: `worktree/{adjective}-{noun}-{shortId}`, branching from the repo's default branch (`main`/`master`).
- **CC / shell launch:** CC and shell sessions are pointed at the worktree directory, not the original repo.

### UI Visibility

- When a task has an active worktree (owned or inherited), the worktree name is displayed next to or below the repo directory in the task UI (e.g. `my-project → brave-falcon-a3f2`).
- This gives users transparency into which worktree they're operating in, especially when inheritance means the worktree was created by a parent task.

### Worktree Inheritance

- Child tasks **inherit** their parent's worktree **by default**.
- A child can **opt out** of inheritance, which creates a new worktree (own name, own branch, from repo default).
- Opting out **breaks the chain** — the child's descendants inherit from the child's worktree, not the grandparent's.
- Inheritance resolution walks up the task tree until it finds a worktree-owning ancestor or hits a task with no repo.

### Inheritance Examples

```
Group
└── Task A (owns worktree brave-falcon-a3f2)
    ├── Subtask B (inherits → uses brave-falcon-a3f2)
    │   └── Subtask D (inherits → uses brave-falcon-a3f2)
    └── Subtask C (opts out → owns new worktree calm-otter-b7e1)
        └── Subtask E (inherits → uses calm-otter-b7e1)
```

## Lifecycle

### Creation Flow

1. User launches CC on a task.
2. Check if task has a worktree (own or inherited).
3. If no → create worktree:
   a. Generate name: `{adjective}-{noun}-{shortId}`
   b. Run `git worktree add <path> -b worktree/<name>` from repo default branch.
   c. Store worktree record on the task (path, branch name, created timestamp).
4. Launch CC in the worktree directory.

### Session Resume Flow

When a user launches CC on a task that already has a worktree record:

1. **Directory exists?** Check that the worktree path exists on disk.
2. **Valid worktree?** Confirm it appears in `git worktree list`.
3. **Branch exists?** Confirm the branch ref is still valid.
4. If all pass → launch CC in the existing worktree.
5. If any fail → **recreate** the worktree (same name/branch if possible) and notify the user that repair occurred. Uncommitted work may be lost.

### Cleanup Flow (Task Deletion)

1. User deletes a task.
2. Deletion confirmation dialog warns about cascade: child tasks and their worktrees will also be deleted.
3. For each task in the deletion set (bottom-up):
   a. If the task **owns** a worktree (not inherited):
   - Remove the worktree: `git worktree remove <path> --force`
   - Delete the branch: `git branch -D worktree/<name>`
   - Remove the worktree record from the database.
     b. If the task **inherits** a worktree: no worktree cleanup needed (the owner handles it).
4. Delete the task records.

**Ordering matters:** Process children before parents to avoid removing a worktree while an inheriting child's record still references it.

## Data Model

### Worktree Record (on Task)

| Field             | Type      | Description                                                    |
| ----------------- | --------- | -------------------------------------------------------------- |
| `worktreeId`      | string    | Unique identifier                                              |
| `name`            | string    | Display name (`brave-falcon-a3f2`)                             |
| `path`            | string    | Absolute path to worktree directory                            |
| `branchName`      | string    | Git branch name (`worktree/brave-falcon-a3f2`)                 |
| `repoPath`        | string    | Path to the parent git repo                                    |
| `createdAt`       | timestamp | Creation time                                                  |
| `inheritWorktree` | boolean   | `true` (default) = inherit from parent; `false` = own worktree |

- Only tasks with `inheritWorktree: false` (or root tasks) have a populated worktree record.
- Inherited worktrees are resolved at runtime by walking the tree, not stored redundantly.

## Settings

| Setting            | Type    | Default                | Description                                                                                                                                                                |
| ------------------ | ------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable worktrees   | boolean | `false`                | Global toggle. When disabled, CC and shell sessions launch in the original repo directory. Existing worktrees are not deleted — they remain until their tasks are deleted. |
| Worktree directory | path    | `~/rundown/worktrees/` | Base directory where all worktrees are created. Changing this only affects new worktrees; existing ones remain at their original path.                                     |

## Edge Cases

| Scenario                                                    | Behavior                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Repo is deleted or moved externally                         | Session resume health check fails → surface error, prompt user to reassign repo                     |
| User disables worktrees feature globally                    | Existing worktrees remain until their tasks are deleted; new CC launches use the repo directly      |
| Task has no repo (and no inherited repo)                    | No worktree created; CC cannot launch (existing behavior)                                           |
| User moves/renames worktree directory externally            | Health check detects mismatch → recreate and notify                                                 |
| Branch deleted externally (e.g. via `git branch -D`)        | Health check detects → recreate branch from default and notify                                      |
| Task is a child, parent has no worktree yet, child inherits | First CC launch on the child triggers worktree creation on the nearest ancestor that should own one |

## Future Considerations

- **Detach worktree:** A `detached: boolean` flag on the worktree record that skips cleanup on task deletion, letting users keep a worktree for manual work. Data model already supports adding this.
- **Custom branch base:** Allow users to specify a base branch/commit instead of always using the repo default.
- **Worktree dashboard:** A view showing all active worktrees, their disk usage, and associated tasks.
- **Merge/PR integration:** Offer to create a PR from the worktree branch when a task is marked complete (before deletion).

## Test Scenarios

### Creation

1. **Basic creation:** Enable worktrees, launch CC on a task with a repo → worktree is created in `~/rundown/worktrees/`, branch created from default, CC opens in worktree directory.
2. **Shell session creation:** Launch a shell session on a task with a repo and no worktree → worktree created, shell opens in worktree directory.
3. **No repo assigned:** Launch CC on a task with no repo (and no inherited repo) → no worktree created, appropriate error shown.
4. **Feature disabled:** Disable worktrees globally, launch CC → CC opens in original repo directory, no worktree created.
5. **Custom directory:** Change worktree directory in settings, create a new worktree → created in the new directory.

### Inheritance

6. **Default inheritance:** Create Task A (owns worktree), add Subtask B (inherits) → launching CC on B uses A's worktree.
7. **Opt-out:** Create Task A (owns worktree), add Subtask B (opts out) → B gets its own worktree branched from repo default, not from A's branch.
8. **Chain break:** A → B (opts out) → C (inherits) → C uses B's worktree, not A's.
9. **Deep inheritance:** A → B (inherits) → C (inherits) → D (inherits) → all use A's worktree.
10. **Child-first launch:** Create Task A → Subtask B (inherits), launch CC on B before ever launching on A → worktree is created and attached to A, B uses it.

### Session Resume

11. **Normal resume:** Launch CC, close it, launch again on same task → same worktree is reused.
12. **Directory deleted externally:** Delete the worktree directory on disk, launch CC → worktree is recreated, user is notified.
13. **Branch deleted externally:** Delete the worktree's branch via git, launch CC → branch and worktree are recreated, user is notified.
14. **Worktree not in git list:** Remove worktree from git's tracking (`git worktree prune`), launch CC → detected and recreated.

### Cleanup

15. **Simple deletion:** Delete a task that owns a worktree → worktree directory removed, branch deleted, record cleaned up.
16. **Cascade deletion:** Delete a parent with children (some inheriting, some with own worktrees) → confirmation dialog warns about cascade, all child tasks deleted, all owned worktrees cleaned up.
17. **Inherited worktree cleanup:** Delete a child that inherits a worktree → child task deleted, parent's worktree is untouched.
18. **Deletion order:** Delete a parent with deep nesting → children processed bottom-up, no dangling references.

### Settings & UI

19. **Toggle off with existing worktrees:** Disable worktrees feature → existing worktrees remain, new sessions use original repo. Re-enable → existing worktrees are picked up again.
20. **Change directory with existing worktrees:** Change base directory → existing worktrees stay at old path and continue to work. New worktrees use new path.
21. **Worktree name in UI:** Task with active worktree shows name next to repo path. Inherited worktree shows the same name with indication it's inherited.
22. **Worktree name in UI (no worktree):** Task with worktrees disabled or no repo shows no worktree info.
