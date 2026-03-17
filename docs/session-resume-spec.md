# Session Resume Feature — Requirements Specification

## Overview

Enable Rundown to track Claude Code session IDs per task, so that returning to a task resumes the previous Claude Code session via the `--resume` flag. Communication between Claude Code hooks and the Electron app happens over a local HTTP server running in the Electron main process.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│ Rundown (Electron)                                  │
│                                                     │
│  Main Process                                       │
│  ├── Task Manager (electron-store)                  │
│  ├── Local HTTP Server (localhost:<port>)            │
│  │     POST /api/sessions { taskId, sessionId }     │
│  └── Claude Code Spawner                            │
│        spawns `claude` with env:                     │
│          RUNDOWN_TASK_ID=<task-id>                   │
│          RUNDOWN_API_PORT=<port>                     │
│                                                     │
│  Renderer Process                                   │
│  └── Settings Window                                │
│        └── "Session Resume" toggle                  │
└──────────────────┬──────────────────────────────────┘
                   │ spawns
                   ▼
┌─────────────────────────────────────────────────────┐
│ Claude Code CLI (`claude`)                          │
│  Hook: StartSession                                 │
│  └── Executes: rundown-cli report-session           │
│        Reads RUNDOWN_TASK_ID + RUNDOWN_API_PORT     │
│        POSTs session ID to Rundown HTTP server      │
└─────────────────────────────────────────────────────┘
```

---

## Components

### 1. Local HTTP Server (Electron Main Process)

**Location:** Electron main process, started at app launch.

**Behavior:**

- Bind to `127.0.0.1` on a random available port.
- Store the chosen port in the electron-store under `server.port` so the renderer and spawner can access it.
- Accept only requests from `127.0.0.1` (loopback only).
- Shut down cleanly on app quit.

**Endpoints:**

#### `POST /api/sessions`

Registers or updates the Claude Code session ID for a given task.

Request body:

```json
{
  "taskId": "string",
  "sessionId": "string"
}
```

Response:

- `200 OK` — session ID stored successfully.
- `400 Bad Request` — missing or invalid `taskId` / `sessionId`.
- `404 Not Found` — `taskId` does not match any known task.

**Storage:** The session ID is persisted in the existing electron-store under the task's data, e.g.:

```json
{
  "tasks": {
    "<task-id>": {
      "name": "Implement auth flow",
      "sessionId": "abc-123-def",
      ...
    }
  }
}
```

### 2. Claude Code Spawner (Electron Main Process)

**Location:** Existing module that spawns `claude` CLI as a child process.

**Modified behavior when session resume is enabled:**

- Read the task's stored `sessionId` from electron-store before spawning.
- If a `sessionId` exists for the task, append `--resume` to the spawn args.
- Always pass the following environment variables to the child process:
  - `RUNDOWN_TASK_ID` — the ID of the task being launched.
  - `RUNDOWN_API_PORT` — the port the local HTTP server is listening on.

**Spawn logic (pseudocode):**

```typescript
const args: string[] = []
const task = store.get(`tasks.${taskId}`)

if (task?.sessionId) {
  args.push('--resume')
}

spawn('claude', args, {
  env: {
    ...process.env,
    RUNDOWN_TASK_ID: taskId,
    RUNDOWN_API_PORT: String(serverPort)
  }
})
```

### 3. Rundown CLI (`cli/`)

**Location:** `cli/` subdirectory of the project repository. Fully self-contained Bun project.

**Tech stack:**

- Runtime: Bun
- Language: TypeScript
- No external dependencies for v1 (Bun's built-in `fetch` and arg parsing are sufficient).

**Project structure:**

```
cli/
├── package.json
├── tsconfig.json
├── bunfig.toml          # (if needed)
└── src/
    ├── index.ts         # Entry point, command router
    └── commands/
        └── report-session.ts
```

**Build:** Compiled to a standalone binary via `bun build --compile` so it can be invoked by Claude Code hooks without requiring Bun on the user's machine. The compiled binary should be named `rundown-cli`. The Electron app's build pipeline should compile the CLI and place the binary at a known path within the packaged app resources.

**Command: `report-session`**

```
rundown-cli report-session --session-id <session-id>
```

Behavior:

1. Read `RUNDOWN_TASK_ID` and `RUNDOWN_API_PORT` from environment variables.
2. If either is missing, exit silently with code 0 (graceful no-op — Claude Code should not be disrupted by hook failures).
3. POST to `http://127.0.0.1:${RUNDOWN_API_PORT}/api/sessions` with:
   ```json
   { "taskId": "<RUNDOWN_TASK_ID>", "sessionId": "<session-id>" }
   ```
4. On success (200), exit with code 0.
5. On any failure (network error, non-200 response), log to stderr and exit with code 0. Hook failures must never break the Claude Code session.

**Extensibility:** The CLI uses a simple command-router pattern (`index.ts` dispatches to `commands/*.ts`) so future commands can be added without restructuring.

### 4. Settings Window (Renderer Process)

**UI:**

- Add a toggle switch labeled **"Session Resume"** in the Settings window.
- Below the toggle, display an info note:
  > ⓘ Enabling this feature will modify your Claude Code configuration (`~/.claude/settings.json`) to register a Rundown session hook. Disabling it will remove the hook.

**Behavior on enable:**

1. Write the hook configuration into `~/.claude/settings.json` (creating the file if it doesn't exist, merging if it does). The hook entry:

   ```json
   {
     "hooks": {
       "StartSession": [
         {
           "matcher": "",
           "hooks": [
             {
               "type": "command",
               "command": "/path/to/rundown-cli report-session --session-id $SESSION_ID"
             }
           ]
         }
       ]
     }
   }
   ```

   - The `command` path must point to the compiled `rundown-cli` binary location within the installed Rundown app.
   - `$SESSION_ID` is a variable provided by Claude Code to the hook at runtime.

2. Store the setting state in electron-store under `settings.sessionResume: true`.

**Behavior on disable:**

1. Remove the Rundown hook entry from `~/.claude/settings.json`. Preserve all other existing hooks and settings.
2. Update electron-store: `settings.sessionResume: false`.

**Edge cases:**

- If `~/.claude/settings.json` does not exist on enable, create it with only the hook config.
- If the file has existing hooks under `StartSession`, append the Rundown hook — do not replace others.
- On disable, remove only the Rundown hook entry. If `StartSession` array becomes empty, remove the key. If `hooks` object becomes empty, remove it. Do not leave empty structures.
- On app startup, verify that the stored setting matches the actual state of `~/.claude/settings.json`. If they are out of sync (e.g., user manually edited the file), update the toggle state to reflect reality.

### 5. Claude Code Config Modification

**Target file:** `~/.claude/settings.json`

**Read/write approach:**

- Read the file, parse JSON, deep-merge the hook entry, write back. Use an atomic write (write to temp file, then rename) to avoid corruption.
- Acquire a simple file lock or use a retry strategy to avoid conflicts if Claude Code is also modifying the file.

**Identification:** The Rundown hook should include a comment-like identifier so it can be reliably found for removal. Since JSON doesn't support comments, embed an identifier in the command string itself, e.g.:

```
/path/to/rundown-cli report-session --session-id $SESSION_ID
```

The presence of `rundown-cli` in the command string is sufficient to identify the hook as belonging to Rundown.

---

## Data Flow: Full Lifecycle

### First launch of a task (no existing session)

1. User clicks "Start Task" in Rundown.
2. Spawner reads task from store — no `sessionId` present.
3. Spawner runs `claude` with env vars `RUNDOWN_TASK_ID` and `RUNDOWN_API_PORT`. No `--resume` flag.
4. Claude Code starts a new session, triggers `StartSession` hook.
5. Hook executes `rundown-cli report-session --session-id <new-session-id>`.
6. CLI POSTs `{ taskId, sessionId }` to the Rundown HTTP server.
7. Server stores `sessionId` on the task in electron-store.

### Subsequent launch of the same task (session exists)

1. User clicks "Start Task" in Rundown.
2. Spawner reads task from store — `sessionId` is present.
3. Spawner runs `claude --resume` with env vars.
4. Claude Code resumes the existing session, triggers `StartSession` hook.
5. Hook reports the (potentially same or new) session ID.
6. Server updates the stored `sessionId`.

### Session resume failure

If Claude Code cannot resume (e.g., session expired or corrupted), it will start a new session. The `StartSession` hook fires regardless, so the new session ID will overwrite the stale one. No special handling is needed.

---

## Non-Functional Requirements

- **No disruption to Claude Code:** All hook failures (CLI crash, server unreachable, bad response) must be silent. The CLI always exits with code 0.
- **Loopback only:** The HTTP server must bind exclusively to `127.0.0.1`. No external network exposure.
- **No Bun dependency for end users:** The CLI is compiled to a standalone binary. Users do not need Bun installed.
- **Atomic config writes:** Modifications to `~/.claude/settings.json` must use atomic write operations.
- **Minimal footprint:** The HTTP server should add negligible resource usage. No polling, no keep-alive connections beyond request handling.

---

## Testing Strategy

All tests run without real Claude Code instances. The architecture's HTTP and env-var boundaries make each component independently testable with standard mocks and test servers.

### Toolchain

- **Electron app tests (server, spawner, config, settings sync, E2E flow):** Vitest — native TypeScript/ESM support, no transform config needed, Jest-compatible API.
- **CLI tests (`cli/` project):** Bun's built-in test runner (`bun test`) — zero additional dependencies, Jest-like API, already available in the CLI's runtime.
- **Renderer / UI E2E:** Playwright (existing).

### 1. HTTP Server (Unit/Integration)

Spin up the real server in-process with a mocked electron-store. Issue fetch calls and assert on store mutations.

- `POST /api/sessions` with valid payload → 200 + `sessionId` persisted on the correct task.
- Missing `taskId` or `sessionId` → 400.
- Unknown `taskId` → 404.
- Concurrent POSTs for different tasks → both stored correctly.

### 2. Spawner Logic (Unit)

Use the existing mocked shell/spawn infrastructure. Assert purely on the shape of the spawn call — args and env vars — without executing anything.

- Task **has** a stored `sessionId` → spawn args include `--resume`, env includes `RUNDOWN_TASK_ID` and `RUNDOWN_API_PORT`.
- Task **has no** stored `sessionId` → spawn args do **not** include `--resume`, env vars still present.
- Session resume feature disabled in settings → env vars not set, `--resume` never added regardless of stored `sessionId`.

### 3. CLI (Unit, within `cli/` project)

Tested in isolation as a standalone Bun project. A minimal test HTTP server (Bun.serve on an ephemeral port) stands in for the Rundown app.

- Happy path: env vars set, test server running → correct POST received, exit code 0.
- Missing `RUNDOWN_TASK_ID` → silent no-op, exit code 0, no HTTP request made.
- Missing `RUNDOWN_API_PORT` → silent no-op, exit code 0, no HTTP request made.
- Server unreachable (nothing listening on port) → stderr log, exit code 0.
- Server returns non-200 → stderr log, exit code 0.

### 4. Config Modification (Unit)

All tests operate on **temporary files in a test-specific directory** (e.g., `os.tmpdir()` or a test fixture folder) — **never** the real `~/.claude/settings.json`. The config module should accept a configurable path, which tests override to point at the temp location.

- **Enable on empty/missing file:** creates `settings.json` with the Rundown hook.
- **Enable with existing hooks:** appends Rundown hook, preserves all existing `StartSession` entries and other hook types.
- **Enable when already enabled:** idempotent, does not duplicate the hook entry.
- **Disable:** removes only the Rundown hook entry. Other hooks remain untouched.
- **Disable — cleanup:** if removing the Rundown hook empties the `StartSession` array, the key is removed. If `hooks` becomes empty, it is removed. No empty structures left behind.
- **Disable when not present:** no-op, file unchanged.
- **Atomicity:** after a write, reading back the file produces valid JSON (simulate crash by checking temp file behavior).

### 5. Settings Toggle ↔ Config Sync (Unit)

- On app startup, if electron-store says enabled but `settings.json` lacks the hook → toggle reflects disabled.
- On app startup, if electron-store says disabled but `settings.json` contains the hook → toggle reflects enabled.

### 6. End-to-End Flow (Integration)

Uses the existing mocked Claude Code. The mock simulates the hook trigger by calling the CLI binary (or directly POSTing to the HTTP server) with a fake session ID.

1. Create a task → spawn mocked Claude → mock triggers the hook → assert `sessionId` is stored on the task.
2. Re-launch the same task → assert spawn args include `--resume` → mock triggers hook with a new session ID → assert stored `sessionId` is updated.

No real Claude Code instances are involved at any point.

---

## Implementation Phases

### Phase 1: HTTP Server + Store Integration

Build the local HTTP server in the Electron main process with the `POST /api/sessions` endpoint. Wire it to electron-store for persistence. Write vitest tests covering all endpoint behaviors (valid payload, validation errors, unknown task). After this phase, the API is functional and can be verified manually with curl.

### Phase 2: CLI

Set up the `cli/` Bun project, implement the `report-session` command, and compile to a standalone binary. Write bun tests for all cases (happy path, missing env vars, server unreachable, non-200 responses). After this phase, the CLI can be manually run against the Phase 1 server to see session IDs land in the store.

### Phase 3: Config Modification Module

Build the `settings.json` read/write/merge logic as a standalone, path-injectable module — no UI dependency. Cover all edge cases with vitest: creating from scratch, appending to existing hooks, idempotent enable, clean removal, empty-structure cleanup, atomic writes. This is the highest-risk code due to merge and cleanup edge cases, so it's isolated and fully tested before any UI touches it.

### Phase 4: Settings UI + Toggle Wiring

Add the "Session Resume" toggle to the Settings window with the info note. Wire the toggle to the config module from Phase 3. Implement the startup sync check (toggle state vs. actual file state). Playwright or manual verification for the UI behavior.

### Phase 5: Spawner Changes + End-to-End

Modify the spawner to read `sessionId` from the store, conditionally add `--resume`, and pass `RUNDOWN_TASK_ID` / `RUNDOWN_API_PORT` as env vars. Write the integration test using the existing mocked Claude: create task → mocked Claude triggers hook → session ID stored → relaunch same task → assert `--resume` in spawn args. This phase connects all prior work into the complete lifecycle.

---

## Out of Scope (v1)

- File-based fallback when the app is not running.
- Multiple simultaneous sessions per task.
- Session history / listing past sessions.
- CLI commands beyond `report-session`.
- Authentication or tokens on the local HTTP server (loopback-only is sufficient for v1).

---

## CLAUDE.md Addition

The following section should be added to the project's `CLAUDE.md`:

```markdown
## Rundown CLI (`cli/`)

A lightweight CLI used as a bridge between Claude Code hooks and the Rundown
Electron app. Lives in `cli/` as a self-contained Bun + TypeScript project.

- **Runtime:** Bun
- **Language:** TypeScript
- **Build:** `cd cli && bun build --compile src/index.ts --outfile rundown-cli`
- **Purpose:** Invoked by Claude Code session hooks to report session IDs back
  to the running Rundown app via its local HTTP API.
- **Architecture:** Command-router pattern — `src/index.ts` dispatches to
  individual command modules in `src/commands/`.
```
