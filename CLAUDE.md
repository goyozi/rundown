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

## Rules

- **Always add dependencies with `pnpm add`** (or `pnpm add -D` for dev deps). Never edit version numbers in `package.json` by hand.
