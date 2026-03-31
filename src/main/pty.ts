import { BrowserWindow, app } from 'electron'
import * as pty from 'node-pty'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  SessionIdSchema,
  CwdSchema,
  PtyThemeSchema,
  PtyWriteDataSchema,
  PtyResizeSchema
} from './validation'
import { IPC } from '../shared/channels'
import { safeHandle } from './ipc-utils'
import { PtyTerminalBuffer } from './pty-buffer'
import { getShellEnv } from './shell-env'

// Denylist of env vars that should not leak into PTY sessions.
// Electron-specific vars could allow escaping the sandbox, and
// sensitive tokens/keys should not be inherited by child processes.
const ENV_DENYLIST = new Set([
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ASAR',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'GOOGLE_API_KEY',
  'GOOGLE_DEFAULT_CLIENT_ID',
  'GOOGLE_DEFAULT_CLIENT_SECRET'
])

function buildSafeEnv(extra: Record<string, string> = {}): Record<string, string> {
  const shellEnv = getShellEnv()
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(shellEnv)) {
    if (!ENV_DENYLIST.has(key)) {
      env[key] = value
    }
  }
  return { ...env, ...extra }
}

const sessions = new Map<string, pty.IPty>()
const termBuffers = new Map<string, PtyTerminalBuffer>()

function getPidFilePath(): string {
  return join(app.getPath('userData'), 'pty-pids.json')
}

function persistSessionPids(): void {
  const pids: Record<string, number> = {}
  for (const [id, proc] of sessions) {
    pids[id] = proc.pid
  }
  try {
    writeFileSync(getPidFilePath(), JSON.stringify(pids))
  } catch {
    // Best-effort — don't crash if we can't write the PID file
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // Signal 0 checks existence without killing
    return true
  } catch {
    return false
  }
}

function cleanupOrphanedSessions(): void {
  try {
    const data = readFileSync(getPidFilePath(), 'utf-8')
    const pids: Record<string, number> = JSON.parse(data)
    for (const pid of Object.values(pids)) {
      try {
        if (isProcessAlive(pid)) {
          process.kill(pid, 'SIGTERM')
        }
      } catch {
        // Process already dead or not owned, ignore
      }
    }
    writeFileSync(getPidFilePath(), '{}')
  } catch {
    // No PID file or invalid — nothing to clean up
  }
}

export function getActiveSessionCount(): number {
  return sessions.size
}

export function killAllSessions(): void {
  for (const proc of sessions.values()) {
    proc.kill()
  }
  sessions.clear()
  for (const buf of termBuffers.values()) {
    buf.dispose()
  }
  termBuffers.clear()
  persistSessionPids()
}

export interface SessionResumeDeps {
  getTaskSessionId: (taskId: string) => string | undefined
  clearTaskSessionId: (taskId: string) => void
  getServerPort: () => number
  isSessionResumeEnabled: () => boolean
  claudeBaseDir?: string
}

/**
 * Check if a Claude Code session exists on disk.
 * Sessions are stored in <baseDir>/projects/<project-hash>/ as either
 * a <session-id>.jsonl file, a <session-id>/ directory, or both.
 */
export function claudeSessionExistsOnDisk(sessionId: string, baseDir?: string): boolean {
  const projectsDir = join(baseDir ?? join(homedir(), '.claude'), 'projects')
  try {
    const projects = readdirSync(projectsDir, { withFileTypes: true })
    for (const proj of projects) {
      if (!proj.isDirectory()) continue
      const projDir = join(projectsDir, proj.name)
      if (existsSync(join(projDir, `${sessionId}.jsonl`)) || existsSync(join(projDir, sessionId))) {
        return true
      }
    }
  } catch {
    // projects dir doesn't exist or isn't readable
  }
  return false
}

export function buildClaudeSpawnParams(
  taskId: string,
  deps?: SessionResumeDeps
): { args: string[]; extraEnv: Record<string, string> } {
  const args: string[] = []
  const extraEnv: Record<string, string> = {}

  if (deps?.isSessionResumeEnabled()) {
    extraEnv.RUNDOWN_TASK_ID = taskId
    extraEnv.RUNDOWN_API_PORT = String(deps.getServerPort())
    const existingSessionId = deps.getTaskSessionId(taskId)
    if (existingSessionId) {
      if (claudeSessionExistsOnDisk(existingSessionId, deps.claudeBaseDir)) {
        args.push('--resume', existingSessionId)
      } else {
        // Session was stored but no longer exists on disk — clear the stale reference
        deps.clearTaskSessionId(taskId)
      }
    }
  }

  return { args, extraEnv }
}

function spawnSession(
  id: string,
  cwd: string,
  theme: string,
  shell: string,
  getMainWindow: () => BrowserWindow | null,
  args: string[] = [],
  extraEnv: Record<string, string> = {}
): { success: boolean; error?: string } {
  if (sessions.has(id)) {
    return { success: false, error: 'Session already exists' }
  }

  // COLORFGBG hints to CLI apps about the terminal background:
  // "0;15" = dark fg on light bg (light mode), "15;0" = light fg on dark bg (dark mode)
  const colorfgbg = theme === 'light' ? '0;15' : '15;0'

  try {
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: buildSafeEnv({ COLORFGBG: colorfgbg, ...extraEnv })
    })

    sessions.set(id, ptyProcess)
    termBuffers.set(id, new PtyTerminalBuffer(80, 24))
    persistSessionPids()

    ptyProcess.onData((data) => {
      termBuffers.get(id)?.write(data)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PTY_DATA, id, data)
      }
    })

    ptyProcess.onExit(() => {
      sessions.delete(id)
      termBuffers.get(id)?.dispose()
      termBuffers.delete(id)
      persistSessionPids()
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC.PTY_EXIT, id)
      }
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function registerPtyHandlers(
  getMainWindow: () => BrowserWindow | null,
  sessionResumeDeps?: SessionResumeDeps
): void {
  cleanupOrphanedSessions()

  safeHandle(
    IPC.PTY_SPAWN,
    (
      _event,
      taskId: unknown,
      cwd: unknown,
      theme: unknown = 'dark'
    ): { success: boolean; error?: string } => {
      const id = SessionIdSchema.parse(taskId)
      const cwdStr = CwdSchema.parse(cwd)
      const themeStr = PtyThemeSchema.parse(theme)
      const claudeBin = process.env.CLAUDE_BIN ?? 'claude'
      const { args, extraEnv } = buildClaudeSpawnParams(id, sessionResumeDeps)
      return spawnSession(id, cwdStr, themeStr, claudeBin, getMainWindow, args, extraEnv)
    }
  )

  safeHandle(
    IPC.PTY_SPAWN_SHELL,
    (
      _event,
      sessionId: unknown,
      cwd: unknown,
      theme: unknown = 'dark'
    ): { success: boolean; error?: string } => {
      const id = SessionIdSchema.parse(sessionId)
      const cwdStr = CwdSchema.parse(cwd)
      const themeStr = PtyThemeSchema.parse(theme)
      const shell = process.env.SHELL_BIN ?? process.env.SHELL ?? '/bin/zsh'
      return spawnSession(id, cwdStr, themeStr, shell, getMainWindow)
    }
  )

  safeHandle(IPC.PTY_WRITE, (_event, taskId: unknown, data: unknown): void => {
    const id = SessionIdSchema.parse(taskId)
    const str = PtyWriteDataSchema.parse(data)
    const proc = sessions.get(id)
    if (proc) {
      proc.write(str)
    }
  })

  safeHandle(IPC.PTY_RESIZE, (_event, taskId: unknown, cols: unknown, rows: unknown): void => {
    const { cols: c, rows: r } = PtyResizeSchema.parse({ cols, rows })
    const id = SessionIdSchema.parse(taskId)
    const proc = sessions.get(id)
    if (proc) {
      proc.resize(c, r)
      termBuffers.get(id)?.resize(c, r)
    }
  })

  safeHandle(IPC.PTY_KILL, (_event, taskId: unknown): void => {
    const id = SessionIdSchema.parse(taskId)
    const proc = sessions.get(id)
    if (proc) {
      proc.kill()
      sessions.delete(id)
      termBuffers.get(id)?.dispose()
      termBuffers.delete(id)
      persistSessionPids()
    }
  })

  safeHandle(IPC.PTY_BUFFER_SNAPSHOT, (_event, taskId: unknown): string => {
    const id = SessionIdSchema.parse(taskId)
    return termBuffers.get(id)?.serialize() ?? ''
  })
}
