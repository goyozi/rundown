# Codebase Review 2

## High Priority

### 1. `_tasks` dummy subscription causes full tree re-renders

**Files:** `TaskItem.tsx`, `DndTaskTree.tsx`, `TaskDetail.tsx`

Multiple components subscribe to `_tasks: s.tasks` solely to trigger re-renders when tasks change, because they call derived methods like `getChildren()` and `getEffectiveDirectory()`. This means every task mutation re-renders every `TaskItem`, every `DndTaskTree`, and `TaskDetail`. With 50+ tasks, every keystroke in a task description triggers a full tree re-render.

The correct pattern is either:

- Use Zustand `computed` middleware or selectors that return the specific derived data
- Or call `getChildren(id)` as a selector: `useTaskStore(s => s.getChildren(task.id))` so Zustand can compare the result

### 2. Comments not persisted to disk

**File:** `src/renderer/src/store/comment-store.ts`

Review comments live only in memory (Zustand state). If the user writes 10 comments across a diff, then the app crashes or they accidentally close it, all comments are lost. Given that composing review feedback is one of the app's core value props, this data should be persisted to electron-store like tasks are.

### 3. Monolithic Zustand store

**File:** `src/renderer/src/store/task-store.ts`

The task store is a 465-line god object with 30+ methods. It mixes:

- CRUD operations (add/update/delete tasks and groups)
- UI state (selectedTaskId, loaded)
- Session state (activeSessions)
- Persistence orchestration (3 separate persist functions)
- Tree traversal algorithms (getDepth, isDescendant, getMaxSubtreeDepth, getEffectiveDirectory)
- Group management

Consider splitting into slices: `task-slice`, `group-slice`, `session-slice`. Zustand's `create` can compose slices via the `combine` pattern.

### 4. No error reporting beyond console.error

**Files:** Global

`electron-log` is imported but only used for auto-updater errors (2 call sites). No crash reporting, no IPC error logging, no renderer error forwarding. In production, when users report bugs, there's no data to debug. At minimum, the `ErrorBoundary` should log to a file, and unhandled rejections in the renderer should be captured.

### 5. Closures over stale state in TaskDetail

**File:** `src/renderer/src/components/TaskDetail.tsx:134-172`

`handlePickDirectory`, `handleStartSession`, `handleStopSession`, and `handleAddShellTab` are all closures defined in the render body (not wrapped in `useCallback`) and they capture `task`, `effectiveDir`, `selectedTaskId` etc. from the current render.

These are `async` functions that await IPC calls. Between the `await` and the continuation, the captured state could be stale. For example in `handleStartSession` (line 160), `task.id` is captured at render time, but by the time `ptySpawn` resolves, the user might have selected a different task.

Additionally, they're passed as props to `TaskHeader` — if `TaskHeader` were memoized, it would hold stale handlers.

### 6. No persistence for IPC Zod parse failures

**Files:** `src/main/store.ts`, `src/main/pty.ts`

If a Zod schema `.parse()` throws inside an `ipcMain.handle`, Electron serializes the error and sends it back as a rejected promise. The renderer never catches these — e.g., `window.api.saveTasks(badData)` would produce an unhandled rejection. The `persist()` functions in task-store catch generic errors, but validation rejections from bad data shapes would surface as uncaught exceptions in the renderer.

## Medium Priority

### 7. `onPtyExit` listener registered twice

**Files:** `App.tsx:30`, `TaskDetail.tsx:73`

Both `App.tsx` and `TaskDetail.tsx` register independent `onPtyExit` listeners. `App.tsx` calls `stopSession()` for all exits, while `TaskDetail` cleans up shell tabs. This works but is fragile — the order of execution isn't guaranteed, and both iterate over state maps. Consolidate into a single listener that handles both concerns.

### 8. `collectAllIds` runs on every render

**File:** `DndTaskTree.tsx:52-64`

This recursive function traverses the entire task tree to produce IDs for `SortableContext`. It's called unconditionally on every render (not memoized). With deep task hierarchies, this is unnecessarily expensive. Wrap in `useMemo` with appropriate dependencies.

### 9. Duplicated directory picker + validation logic

**Files:** `TaskDetail.tsx:142-154`, `TaskList.tsx:86-97`

`TaskDetail.handlePickDirectory` and `TaskList.handlePickGroupDirectory` are nearly identical: open dialog → validate repo → set error or update. Extract a shared hook like `useDirectoryPicker(onValid, onError)`.

### 10. `DiffMode` type defined twice

**Files:** `TaskDetail.tsx:22`, `ReviewPanel.tsx:14`

`type DiffMode = 'uncommitted' | 'branch'` appears in both files. Extract to a shared location (e.g., `src/shared/types.ts` or a local `types.ts` in the components directory).

### 11. No loading/error states for initial data load

**File:** `App.tsx:24`

`loadTasks()` fires and the spinner shows, but if the IPC call fails (corrupted store, disk error), the promise rejects with no catch handler. The app would remain in the loading spinner forever. Add error handling to `loadTasks` with a user-facing error state.
