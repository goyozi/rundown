# CLAUDE.md

## What this is

**Rundown** is a desktop app (Electron) that combines a todo list, embedded Claude Code terminal sessions, and a GitHub-style code review interface. Users manage coding tasks, run Claude Code against Git repos, review diffs inline, and submit review comments directly back into the Claude Code session as a feedback loop.

## Tech stack

Electron + electron-vite (v5), React + TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, xterm.js + node-pty, simple-git, react-diff-view, electron-store.

## Rules

- **Always add dependencies with `pnpm add`** (or `pnpm add -D` for dev deps). Never edit version numbers in `package.json` by hand.
