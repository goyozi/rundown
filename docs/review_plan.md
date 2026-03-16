# Review Items 2-6 Implementation Plan

## Context

Addressing codebase review findings (sections 2-6) covering React best practices, componentization, production readiness, type safety, and minor cleanup. Section 1 (Electron best practices) is already done — sandbox enabled, CSP headers set, URL validation in place, env denylist working, Zod validation on IPC, auto-updater error handling added.

---

## Chunk 1: Dead Code & Trivial Fixes

- **Delete** `src/renderer/src/assets/base.css` — not imported anywhere
- **Delete** `src/renderer/src/components/Versions.tsx` — not imported anywhere
- **`src/main/index.ts:11`** — add comment explaining ESM `__dirname` polyfill

---

## Chunk 2: Shared IPC Channel Constants

- **Create `src/shared/channels.ts`** — export `IPC` const object with all 23 channel names
- **Update** `src/main/index.ts`, `src/main/store.ts`, `src/main/pty.ts`, `src/preload/index.ts` — replace string literals with `IPC.*`

---

## Chunk 3: React Best Practices

- **`TerminalPanel.tsx:155`** — remove `resolved` from main useEffect deps (theme effect at lines 78-83 already handles changes)
- **`TaskDetail.tsx:43`** — replace module-level `let shellCounter = 0` with `useRef(0)`
- **`use-theme.ts`** — move `setTheme`/`cycle` to module-level functions (they only use module-level state), making them stable references
- **`ReviewPanel.tsx`** — combine the two cascading effects (fetchBranchInfo → fetchDiff) into a single effect on `[directory, mode]`
- **`task-store.ts` + consumers** — replace large destructures with fine-grained selectors using `zustand/shallow`. Split actions (stable) from data (shallow-compared)
- **Skip**: keyboard nav DOM queries — working fine, not worth the complexity

---

## Chunk 4: PTY Refactoring

- **`src/main/pty.ts`** — extract shared `spawnSession(id, cwd, theme, shell, mainWindow)` helper from `pty:spawn` and `pty:spawn-shell` (95% identical code)

---

## Chunk 5: Type Safety

- **`src/preload/index.ts`** — change `unknown[]` params to `Task[]`/`TaskGroup[]`
- **`src/main/store.ts`** — add explicit return types to all IPC handlers
- **`src/main/pty.ts`** — add explicit return types to IPC handlers
- **Skip**: env cast — `buildSafeEnv` already filters undefined values properly

---

## Chunk 6: Componentization

Extract from **TaskList.tsx** (~420 → ~150 lines):

- `GroupSelector.tsx` — popover + group list
- `SettingsDialog.tsx` — theme settings dialog
- `GroupDeleteConfirmDialog.tsx` — delete confirmation

Extract from **TaskDetail.tsx** (~475 → ~200 lines):

- `TaskHeader.tsx` — title, directory, badges, session controls
- `TabBar.tsx` — tab rendering, add/close shell logic

Extract from **ReviewPanel.tsx** (~665 → ~200 lines):

- `DiffFileCard.tsx` — single file diff card
- `ReviewToolbar.tsx` — mode toggle, stats, controls
- `lib/diff-utils.ts` — pure functions: `detectLanguage`, `tokenizeFile`, `resolveFilePath`, `computeStats`, etc.

---

## Chunk 7: Production Readiness

- **Error boundary** — create `ErrorBoundary.tsx` (class component), wrap `<App />` with reload button fallback
- **Structured logging** — `pnpm add electron-log`, create `src/main/logger.ts`, replace console calls in main process
- **Persistence error handling** — wrap `persist()`/`persistGroups()`/`persistRootTaskOrder()` in try/catch
- **Persistence debouncing** — debounce persist calls (~300ms) in task-store
- **Close confirmation** — `beforeunload` handler checking unsaved comments + active sessions; export `getActiveSessionCount()` from pty.ts, show dialog on window close
- **Git timeout** — `simpleGit(dir, { timeout: { block: 15000 } })` on all 4 git handlers; extract `createGit(dir)` helper
- **Schema versioning** — add `schemaVersion` field to store, convert ad-hoc migrations to versioned sequential system

---

## Execution Order

| #   | Chunk                     | Risk     | Size |
| --- | ------------------------- | -------- | ---- |
| 1   | Dead code & trivial fixes | Minimal  | XS   |
| 2   | IPC channel constants     | Low      | S    |
| 3   | React best practices      | Low-Med  | M    |
| 4   | PTY refactoring           | Low-Med  | S    |
| 5   | Type safety               | Low-Med  | S    |
| 6   | Componentization          | Medium   | L    |
| 7   | Production readiness      | Med-High | L    |

Chunks 1-2 first (foundational). Chunks 3-5 are independent. Chunk 6 after 3 (extract already-fixed code). Chunk 7 last (highest risk).

## Verification

After each chunk: `pnpm build` (typecheck + build), `pnpm test` (Playwright). After chunk 7 specifically: manual test of error boundary (throw in a component), close confirmation (close with active session/comments), and git timeout (point at a non-existent remote).
