# Tech Stack

## Core Platform

| Layer           | Technology             | Role                                                                                                              |
| --------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Desktop shell   | **Electron**           | Cross-platform desktop app with Node.js main process and Chromium renderer                                        |
| Build tooling   | **electron-vite (v5)** | Unified Vite-based build for main, preload, and renderer processes. HMR for renderer, hot-reload for main/preload |
| Package manager | **pnpm**               | Fast, disk-efficient package management with strict dependency resolution                                         |

## Frontend (Renderer Process)

| Layer             | Technology                                         | Role                                                                                                |
| ----------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| UI framework      | **React + TypeScript**                             | Component-based UI with type safety                                                                 |
| Styling           | **Tailwind CSS v4** + **@tailwindcss/vite** plugin | Utility-first CSS, integrated as a Vite plugin (no PostCSS config needed in v4)                     |
| Component library | **shadcn/ui**                                      | Accessible, composable primitives (dialogs, buttons, sidebar, collapsibles) copied into the project |
| State management  | **Zustand**                                        | Lightweight store for task tree, session state, and comment pool                                    |

## Terminal

| Layer             | Technology                          | Role                                                                                                 |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PTY backend       | **node-pty**                        | Spawns pseudoterminal processes in the main process (native C++ addon, requires `@electron/rebuild`) |
| Terminal frontend | **xterm.js** + **@xterm/addon-fit** | Renders the terminal in the renderer process; fit addon handles resize                               |

node-pty runs in the main process. xterm.js runs in the renderer. They communicate over Electron IPC (`ipcMain` / `ipcRenderer` via `contextBridge`).

## Git & Diff

| Layer          | Technology                               | Role                                                                                   |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Git operations | **simple-git**                           | Node.js wrapper around git CLI — used for diffing, branch detection, repo validation   |
| Diff viewer    | **react-diff-view** + **gitdiff-parser** | GitHub-style unified/split diff rendering with widget architecture for inline comments |

`simple-git` runs in the main process. Diff output (unified diff text) is parsed by `react-diff-view`'s `parseDiff` in the renderer.

## Persistence

| Layer         | Technology         | Role                                                                                                  |
| ------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Local storage | **electron-store** | JSON-based key-value store for persisting tasks, sub-tasks, and directory assignments across restarts |

## IPC Architecture

All Node.js work (pty spawning, git commands, file I/O, persistence) lives in the **main process**. The renderer communicates exclusively through Electron's `contextBridge` + `ipcMain`/`ipcRenderer`. No `nodeIntegration` in the renderer.

Key IPC channels:

- `pty:spawn`, `pty:write`, `pty:resize`, `pty:kill` — terminal lifecycle
- `pty:data` — terminal output stream (main → renderer)
- `git:validate-repo`, `git:detect-branch` — git operations (validation & branch detection)
- `git:diff-uncommitted`, `git:diff-branch` — git diff operations (one per diff mode)
- `store:get-tasks`, `store:save-tasks` — persistence
- `dialog:open-directory` — native folder picker (wraps `dialog.showOpenDialog`)

## Session Tracking

The main process maintains an in-memory `Map<string, IPty>` keyed by task/sub-task ID. When the renderer calls `pty:spawn`, the main process creates the PTY and stores it in the map. All subsequent `pty:write`, `pty:resize`, and `pty:kill` calls include the task ID so the main process can route to the correct PTY instance. This map is not persisted — sessions do not survive app restarts.

## Task Data Shape

Tasks are persisted via electron-store as a flat array. Each task:

```ts
interface Task {
  id: string // UUID
  description: string
  directory?: string // absolute path to a Git repo, optional
  state: 'idle' | 'done' // persisted states only (In Progress is runtime-only, derived from active session)
  parentId?: string // undefined for root tasks
  children: string[] // ordered list of child task IDs
  createdAt: string // ISO timestamp
}
```

The store holds `{ tasks: Task[] }`. The renderer reconstructs the tree from `parentId`/`children` on load. "In Progress" is not persisted — on restart, all tasks revert to their persisted state (idle or done) since sessions don't survive restarts.
