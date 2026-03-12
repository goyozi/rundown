# Testing Strategy

## Tool

**Playwright** with the [`electron`](https://playwright.dev/docs/api/class-electron) launch API (`_electron.launch()`). Playwright can launch the Electron app, get a reference to the main `BrowserWindow`, and interact with the renderer like a normal web page.

Install:
```
pnpm add -D @playwright/test playwright
```

Run:
```
pnpm exec playwright test
```

Tests live in `tests/` at the project root.

---

## The Claude Stub

Real Claude Code must never run in tests. Instead, we replace the `claude` binary with a small Node.js script that mimics a PTY-attached process. The app discovers the binary via a configurable path (or `PATH`), so tests override it.

### How the stub works

`tests/fixtures/claude-stub.js` — a Node.js script shebang'd with `#!/usr/bin/env node`:

```js
#!/usr/bin/env node
// Simulates a Claude Code session for testing.
// Reads CLAUDE_STUB_SCRIPT env var to pick a behaviour preset.
const preset = process.env.CLAUDE_STUB_SCRIPT ?? 'echo';

switch (preset) {
  case 'echo':
    // Immediately echo whatever is typed on stdin, then stay open.
    process.stdin.on('data', (d) => process.stdout.write(`> ${d}`));
    break;

  case 'idle':
    // Print a prompt and do nothing. Useful for testing "session active" UI.
    process.stdout.write('claude> ');
    break;

  case 'apply-feedback':
    // Print a canned "applying changes" response when any input arrives.
    process.stdin.once('data', () => {
      process.stdout.write('Got your feedback. Applying changes...\n');
      setTimeout(() => process.stdout.write('Done.\n'), 300);
    });
    break;
}
// Never exits on its own — tests kill it via Stop Session.
```

### Injecting the stub

In `electron-vite` / Electron, the main process spawns the PTY. We add a single escape hatch in the spawn logic:

```ts
// src/main/pty.ts
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';
pty.spawn(claudeBin, [], { cwd: dir, ... });
```

In Playwright tests, pass the env var when launching:

```ts
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: {
    ...process.env,
    CLAUDE_BIN: path.resolve('tests/fixtures/claude-stub.js'),
    CLAUDE_STUB_SCRIPT: 'idle',
  },
});
```

This requires no mocking framework and keeps the IPC/PTY code path exercised end-to-end.

---

## Test Structure

```
tests/
  fixtures/
    claude-stub.js          # The stub binary (chmod +x)
    git-repo.ts             # Helper: creates a temp Git repo with staged/unstaged changes
  helpers/
    app.ts                  # launch() wrapper that sets CLAUDE_BIN and returns { app, page }
    tasks.ts                # UI helpers: createTask(), assignDir(), startSession(), etc.
  phase1-tasks.spec.ts
  phase2-git-validation.spec.ts
  phase3-sessions.spec.ts
  phase4-diff-viewer.spec.ts
  phase5-feedback-loop.spec.ts
```

### `tests/helpers/app.ts`

```ts
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';

export async function launchApp(stubScript = 'idle'): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: {
      ...process.env,
      CLAUDE_BIN: path.resolve('tests/fixtures/claude-stub.js'),
      CLAUDE_STUB_SCRIPT: stubScript,
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}
```

### `tests/fixtures/git-repo.ts`

Creates a real temporary Git repo with some files, commits, and optionally dirty working-tree changes. Returns the path. Cleaned up in `afterEach`.

```ts
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

export function createTempGitRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rundown-test-'));
  execSync('git init && git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' });
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 1;\n');
  execSync('git add . && git commit -m "initial file"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

export function dirtyRepo(dir: string): void {
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 2; // changed\n');
}
```

---

## Tests by Phase

### Phase 1 — Task Management (`phase1-tasks.spec.ts`)

| Test | What it verifies |
|------|-----------------|
| Create a task | New task appears in the list with correct description |
| Edit task description | Hover icon → edit → save → updated text shown |
| Delete a task | Task removed from list; persisted state updated |
| Create nested sub-tasks (up to 5 levels) | Sub-task tree renders correctly |
| Mark as Done (no session) | Task moves to Done state immediately (no confirmation dialog — sessions don't exist yet) |
| Persistence across restart | Close and relaunch app; tasks still present |
| Click task navigates to detail | Clicking a task shows its detail/placeholder view |

### Phase 2 — Git Validation (`phase2-git-validation.spec.ts`)

| Test | What it verifies |
|------|-----------------|
| Assign valid Git repo | Directory saved, no error shown |
| Assign non-Git directory | Inline error message shown, directory not saved |
| Assign non-existent path | Inline error message shown |
| Sub-task inherits parent directory | Sub-task shows parent path as its effective directory |

### Phase 3 — Sessions (`phase3-sessions.spec.ts`)

Uses `CLAUDE_STUB_SCRIPT=idle`.

| Test | What it verifies |
|------|-----------------|
| Start Session → terminal appears | xterm.js panel is visible; task state = In Progress |
| Terminal receives keystrokes | Type in terminal → characters appear |
| Stop Session | Terminal closes; task returns to Idle |
| Cannot start second session on same task | "Start Session" button disabled while session active |
| Multiple sessions across tasks | Two tasks can each have an active session simultaneously |
| Mark as Done with active session | Confirmation dialog appears; confirm → session killed + Done |
| Mark as Done with active session (cancel) | Task stays In Progress |

### Phase 4 — Diff Viewer (`phase4-diff-viewer.spec.ts`)

Uses a real temp Git repo with dirty changes. No PTY needed for most tests.

| Test | What it verifies |
|------|-----------------|
| Uncommitted Changes mode shows modified file | Dirty file appears in diff with correct hunks |
| Uncommitted Changes — clean repo | Shows "no changes" empty state |
| Branch vs. Main mode shows committed diff | Committed changes on a non-main branch appear |
| Auto-detects `main` vs `master` | Works with repos using either branch name |
| Collapse/expand file in diff | File diff collapses and expands |
| Summary bar shows correct counts | Files changed / lines +/- matches actual diff |
| Refresh button reloads diff | Modify a file after opening review → refresh → new change appears |
| Toggle between modes | Switch modes; correct diff shown for each |

### Phase 5 — Feedback Loop (`phase5-feedback-loop.spec.ts`)

Uses `CLAUDE_STUB_SCRIPT=apply-feedback` and a dirty Git repo.

| Test | What it verifies |
|------|-----------------|
| Add inline comment on a line | Comment widget appears attached to the correct line |
| Comments persist on diff mode switch | Add comment in mode A, switch to mode B, switch back → comment still there |
| Comment on file only in one mode is hidden in other | Helper "N hidden" count is shown |
| Submit to Claude sends all comments | Stub receives the serialized feedback text in its stdin |
| Feedback format matches spec | Output contains `## path (lines X-Y)` headers and comment bodies |
| Comments cleared after submission | Comment pool is empty; widgets gone from diff |
| Terminal focused after submission | Terminal panel is active/focused |

---

## Playwright Configuration

A `playwright.config.ts` at the project root:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Electron tests must run serially — each needs exclusive access to the app
  use: {
    trace: 'on-first-retry',
  },
});
```

Serial execution (`workers: 1`) is required because Playwright's Electron API launches a real app process, and tests share OS-level resources (display, temp dirs).

---

## Build Prerequisite

Tests run against the **built** app (`out/main/index.js`), not `electron-vite dev`. Add a pre-test build step:

```json
// package.json
"test": "electron-vite build && playwright test"
```

Or run `pnpm build` once and then `pnpm exec playwright test` during development to avoid rebuilding on every run.

---

## CI Considerations

- Tests need a display. On Linux CI, prefix with `xvfb-run -a`.
- The temp Git repo fixture relies on `git` being installed on the CI runner — a safe assumption.
- The claude stub must be executable: `chmod +x tests/fixtures/claude-stub.js` (or handle in the fixture setup).
- Keep tests isolated: each test gets a fresh `launchApp()` + fresh temp repo, torn down in `afterEach`.
