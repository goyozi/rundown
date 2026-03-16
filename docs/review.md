# Codebase Review: Rundown

## 1. Electron Best Practices

### `sandbox: false` is a real concern

`src/main/index.ts:29` — Sandbox is disabled to allow node-pty. This is the biggest security gap. In production, a compromised renderer has full Node.js access. The recommended pattern is to keep `sandbox: true` and run node-pty operations entirely in the main process (which you already do), communicating only via IPC. The preload script doesn't need unsandboxed access since it only calls `ipcRenderer.invoke`. **You should be able to set `sandbox: true` and it should still work** — worth testing.

### No CSP (Content Security Policy)

There's no `Content-Security-Policy` header set on the renderer. For production, add a CSP via `session.defaultSession.webRequest.onHeadersReceived` or a meta tag to restrict script sources, prevent inline scripts, and block `eval()`.

### `shell.openExternal` without URL validation

`src/main/index.ts:68` — `shell.openExternal(details.url)` opens any URL the renderer requests. A compromised renderer could open `file://` or custom protocol URLs. Add allowlisting for `https://` URLs only.

### PTY environment leaks

`src/main/pty.ts:34` — `...process.env` spreads the entire main process environment into PTY sessions. This could expose secrets (tokens, keys) present in the Electron main process environment. Consider explicitly allowlisting env vars.

### No IPC input validation

`src/main/store.ts` — IPC handlers like `store:save-tasks` blindly trust data from the renderer. In production, validate that the incoming data matches the expected schema before persisting. A malformed payload could corrupt the store.

### Auto-updater has no error handling

`src/main/index.ts:106` — `checkForUpdatesAndNotify()` is fire-and-forget. If the update server is unreachable or returns invalid data, this could silently fail or throw. Wrap in try/catch and consider listening to updater events.

### `activeSessions` is not persisted

If the app crashes while sessions are running, the state shows no sessions even though orphaned PTY processes may still be running (on Linux/macOS). Consider checking for orphan processes on startup, or persisting session state.

## 2. React Best Practices

### Zustand store getter functions cause unnecessary re-renders

`src/renderer/src/store/task-store.ts` — Functions like `getRootTasks()`, `getChildren()`, `getEffectiveDirectory()` are defined inside the store and called during render. Every component that subscribes to the store re-renders when _any_ state changes because these functions create new arrays/objects each time. Consider:

- Using selectors: `useTaskStore(s => s.tasks.filter(...))` with shallow equality
- Or memoizing at the component level

### TaskList destructures too many store fields

`src/renderer/src/components/TaskList.tsx:35-49` — Destructuring `tasks`, `activeSessions`, and many functions from the store means this component re-renders on every task mutation, session change, etc. Use fine-grained selectors:

```ts
const rootTasks = useTaskStore((s) => s.getRootTasks())
```

### `resolved` in TerminalPanel useEffect dependencies causes full terminal recreation

`src/renderer/src/components/TerminalPanel.tsx:155` — `resolved` is in the dependency array of the main `useEffect` that creates the Terminal instance. Changing the theme destroys and recreates the entire terminal, losing scroll history. You already have a separate effect for theme updates (line 78-83), so remove `resolved` from the main effect's deps.

### Module-level mutable state

`src/renderer/src/components/TaskDetail.tsx:43` — `let shellCounter = 0` is module-level mutable state. If this component is ever mounted twice (e.g., React StrictMode in dev, or future multi-window support), counters will collide. Use a `useRef` instead, or better yet derive the next number from `shellTabs.length`.

### `useTheme` hook recreates `setTheme`/`cycle` on every render

`src/renderer/src/hooks/use-theme.ts:63-75` — `setTheme` and `cycle` are defined as plain functions inside the hook, creating new references every render. If passed as props or deps, this triggers unnecessary work. Wrap in `useCallback` or define them outside the hook as stable functions.

### ReviewPanel has a `fetchDiff` / `useEffect` / re-fetch cycle risk

`src/renderer/src/components/ReviewPanel.tsx:255-299` — `fetchDiff` depends on `branchInfo`, and `fetchBranchInfo` sets `branchInfo`. The two effects (one fetching branch info, one fetching diff) can trigger cascading re-renders. The `fetchDiff` callback also changes identity when `branchInfo` changes, causing the effect to re-run. This works but is fragile — consider combining into a single effect.

### Keyboard nav hook queries the DOM instead of using React state

`src/renderer/src/hooks/use-task-keyboard-nav.ts:7-8` — `getVisibleTaskIds` uses `querySelectorAll` to find visible tasks. This bypasses React's data model and couples the hook to DOM structure. It works for now but is brittle — if task items change their DOM structure or `data-task-id` attribute, the hook breaks silently.

## 3. Componentization & Modularity

### TaskList is doing too much (~420 lines)

`TaskList.tsx` handles: group selector, group CRUD, group directory picker, task creation, settings dialog, delete confirmation dialog, and the task tree. Extract:

- `GroupSelector` component (the Popover + group list)
- `SettingsDialog` component
- `GroupDeleteConfirmDialog` component

### TaskDetail is similarly overloaded (~475 lines)

It manages: task header, directory picker, session controls, tab bar, shell tab lifecycle, and content routing. Extract:

- `TaskHeader` (title, badge, directory, session buttons)
- `TabBar` (tab rendering, add/close shell logic)

### ReviewPanel at 665 lines is the largest component

The comment submission logic, stats computation, file rendering, and toolbar are all in one file. Extract:

- `DiffFileCard` for individual file rendering
- `ReviewToolbar` for the mode toggle and stats bar
- Move `computeStats`, `fileStats`, `tokenizeFile`, `detectLanguage`, `resolveFilePath` to a `lib/diff-utils.ts`

### PTY handler duplication

`src/main/pty.ts` — `pty:spawn` and `pty:spawn-shell` share ~90% of their code (environment setup, event wiring, session management). Extract a shared `spawnSession(id, command, args, cwd, theme)` helper.

### IPC channel strings are scattered

IPC channel names (`'store:get-tasks'`, `'pty:spawn'`, etc.) are string literals duplicated across main, preload, and potentially test files. A shared `channels.ts` constant would prevent typos and make refactoring safer.

## 4. Production Readiness

### No error boundaries

If any React component throws during render, the entire app crashes with a white screen. Add at least a top-level `ErrorBoundary` around `<App />` that shows a "something went wrong" UI and offers a reload button.

### No logging infrastructure

The main process has no structured logging. Console output disappears in production. Add a logger (e.g., `electron-log`) that writes to files for debugging production issues.

### Task persistence is fire-and-forget

`src/renderer/src/store/task-store.ts:128` — `get().persist()` is called without awaiting the result. If the IPC call fails (e.g., store file is locked), data loss occurs silently. At minimum, catch errors and surface them.

### No persistence debouncing

Every keystroke during task description editing triggers `persist()` → IPC → disk write. This could cause performance issues with many tasks. Debounce persist calls (200-300ms).

### The comment store is ephemeral

`comment-store.ts` is in-memory only. If the app crashes or the user accidentally closes it while writing review comments, all comments are lost. Consider persisting to electron-store as well, or at least warning on close if unsaved comments exist.

### No `beforeunload` / close confirmation

There's no prompt when closing the app with active sessions or unsaved review comments.

### Git operations have no timeout

`src/main/store.ts` — `simple-git` operations (`git diff`, `git status`) have no timeout. A large repo or network issue (for remote operations) could hang the IPC indefinitely. Set `simpleGit(dirPath, { timeout: { block: 10000 } })`.

### Store schema migrations are fragile

`src/main/store.ts:48-91` — Migrations run at module load time and are imperative. As the schema evolves, this will become harder to maintain. Consider a versioned migration system (store a schema version number, apply migrations sequentially).

## 5. Type Safety

### Preload types are loose

`src/preload/index.ts:6` — `saveTasks(tasks: unknown[])` and `saveGroups(groups: unknown[])` accept `unknown[]`. These should be `Task[]` and `TaskGroup[]` to get type checking at the boundary.

### Missing return types on IPC handlers

Most IPC handlers in `store.ts` don't have explicit return type annotations. TypeScript infers them, but explicit types would catch accidental changes and serve as documentation.

### `as Record<string, string>` cast on env

`src/main/pty.ts:38` — The environment spread uses `as Record<string, string>` which discards the fact that env values can be `undefined`. Use `Object.fromEntries(Object.entries(process.env).filter(([,v]) => v !== undefined))` or just accept that node-pty handles `undefined` values.

## 6. Minor Issues

- `src/renderer/src/assets/base.css` appears to be legacy/dead code superseded by `main.css` — verify and remove if unused
- `src/renderer/src/components/Versions.tsx` seems like scaffolding — remove if not used
- `src/main/index.ts:10` — Manual `__dirname` polyfill via `fileURLToPath` — this is correct for ESM but could use a comment explaining why
- `src/renderer/src/components/TaskItem.tsx:108` — `dropIntent?.targetId === task.id` uses optional chaining on a prop that's already typed as `DropIntent | null | undefined` — fine, but the type could be tighter
