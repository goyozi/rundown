# CLAUDE.md

## What this is

**Rundown** is a desktop app (Electron) that combines a todo list, embedded Claude Code terminal sessions, and a GitHub-style code review interface. Users manage coding tasks, run Claude Code against Git repos, review diffs inline, and submit review comments directly back into the Claude Code session as a feedback loop.

## Tech stack

Electron + electron-vite (v5), React + TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, xterm.js + node-pty, simple-git, react-diff-view, electron-store.

## Testing

- Run all tests: `pnpm test` (builds the app first, then runs Playwright).
- Run without rebuilding: `pnpm test:norebuild`

## UI & Design

- **Always load the `frontend-design` skill** (via `/frontend-design`) before doing UI work. It provides guidelines for typography, color, motion, and avoiding generic AI aesthetics.
- **Add shadcn components with `pnpm dlx shadcn@latest add <component>`** (not npx). Load the `shadcn` skill when working with shadcn components.
- **Design direction**: Premium developer tool aesthetic (think Linear/Raycast). Refined, dark-mode-friendly, with a **blue-violet accent** (oklch hue 264) threading through primary, accent, sidebar, and ring colors. Geist Variable font. Subtle depth via tinted backgrounds, layered icons, and staggered fade-in animations. The sidebar has its own slightly tinted background distinct from the main pane. Task states use a green `--success` color. Action buttons have tooltips. Status badges on task detail. Monospace `<code>` tags for file paths.

## Session Resume

Rundown can track Claude Code session IDs per task so that returning to a task resumes the previous session. The pieces:

- **Local HTTP server** (`src/main/server.ts`) — started in the Electron main process on a random loopback port. Exposes `POST /api/sessions` for the CLI to report session IDs. Port is stored in electron-store under `serverPort`.
- **Rundown CLI** (`cli/`) — self-contained Bun + TypeScript project compiled to a standalone binary via `bun build --compile`. Build with `pnpm build:cli`. Invoked by a Claude Code `SessionStart` hook; reads `session_id` from stdin JSON (provided by Claude Code) and `RUNDOWN_TASK_ID` / `RUNDOWN_API_PORT` from env vars, then POSTs to the HTTP server. Must always exit 0 — hook failures must never break Claude Code.
- **Config module** (`src/main/claude-config.ts`) — reads/writes `~/.claude/settings.json` to register/unregister the hook. Uses atomic writes (temp file + rename). Identifies the Rundown hook by the presence of `rundown-cli` in the command string.
- **Spawner** (`src/main/pty.ts`, `buildClaudeSpawnParams`) — when session resume is enabled, passes `RUNDOWN_TASK_ID` and `RUNDOWN_API_PORT` as env vars, and adds `--resume <sessionId>` if the task has a stored session ID.
- **Settings toggle** (renderer) — enables/disables the feature; wires to the config module via `SESSION_RESUME_SET` IPC. On startup, syncs toggle state with the actual file state.
- **Unit tests** — vitest (`pnpm test:unit`) for server, spawner, config, and E2E flow. CLI tests use `bun test` inside `cli/`.

## Rules

- **Always use `pnpm` — never `npm` or `npx`.** This project uses pnpm as its package manager. Use `pnpm add` / `pnpm add -D` for dependencies, `pnpm dlx` instead of `npx`, and `pnpm run` (or just `pnpm <script>`) to invoke scripts. Never edit version numbers in `package.json` by hand.
- **Use predefined scripts** from `package.json` instead of running tools directly. Key commands:
  - `pnpm dev` — start the app in dev mode
  - `pnpm build` — typecheck + build
  - `pnpm test` — build + run Playwright tests
  - `pnpm test:norebuild` — run Playwright tests without rebuilding
  - `pnpm lint` — run ESLint
  - `pnpm format` — run Prettier
  - `pnpm typecheck` — run TypeScript type checking
