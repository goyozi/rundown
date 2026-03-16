import { ipcMain, BrowserWindow, app } from 'electron'
import * as pty from 'node-pty'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  SessionIdSchema,
  CwdSchema,
  PtyThemeSchema,
  PtyWriteDataSchema,
  PtyResizeSchema
} from './validation'

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
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !ENV_DENYLIST.has(key)) {
      env[key] = value
    }
  }
  return { ...env, ...extra }
}

const sessions = new Map<string, pty.IPty>()

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

function cleanupOrphanedSessions(): void {
  try {
    const data = readFileSync(getPidFilePath(), 'utf-8')
    const pids: Record<string, number> = JSON.parse(data)
    for (const pid of Object.values(pids)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Process already dead, ignore
      }
    }
    writeFileSync(getPidFilePath(), '{}')
  } catch {
    // No PID file or invalid — nothing to clean up
  }
}

export function killAllSessions(): void {
  for (const [id, proc] of sessions) {
    proc.kill()
    sessions.delete(id)
  }
  persistSessionPids()
}

export function registerPtyHandlers(getMainWindow: () => BrowserWindow | null): void {
  cleanupOrphanedSessions()

  ipcMain.handle('pty:spawn', (_event, taskId: unknown, cwd: unknown, theme: unknown = 'dark') => {
    const id = SessionIdSchema.parse(taskId)
    const cwdStr = CwdSchema.parse(cwd)
    const themeStr = PtyThemeSchema.parse(theme)

    if (sessions.has(id)) {
      return { success: false, error: 'Session already active for this task' }
    }

    const claudeBin = process.env.CLAUDE_BIN ?? 'claude'
    const shell = claudeBin

    // COLORFGBG hints to CLI apps about the terminal background:
    // "0;15" = dark fg on light bg (light mode), "15;0" = light fg on dark bg (dark mode)
    const colorfgbg = themeStr === 'light' ? '0;15' : '15;0'

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: cwdStr,
        env: buildSafeEnv({ COLORFGBG: colorfgbg })
      })

      sessions.set(id, ptyProcess)
      persistSessionPids()

      ptyProcess.onData((data) => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:data', id, data)
        }
      })

      ptyProcess.onExit(() => {
        sessions.delete(id)
        persistSessionPids()
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:exit', id)
        }
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'pty:spawn-shell',
    (_event, sessionId: unknown, cwd: unknown, theme: unknown = 'dark') => {
      const id = SessionIdSchema.parse(sessionId)
      const cwdStr = CwdSchema.parse(cwd)
      const themeStr = PtyThemeSchema.parse(theme)

      if (sessions.has(id)) {
        return { success: false, error: 'Session already exists' }
      }

      const shell = process.env.SHELL_BIN ?? process.env.SHELL ?? '/bin/zsh'
      const colorfgbg = themeStr === 'light' ? '0;15' : '15;0'

      try {
        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: cwdStr,
          env: buildSafeEnv({ COLORFGBG: colorfgbg })
        })

        sessions.set(id, ptyProcess)
        persistSessionPids()

        ptyProcess.onData((data) => {
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('pty:data', id, data)
          }
        })

        ptyProcess.onExit(() => {
          sessions.delete(id)
          persistSessionPids()
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('pty:exit', id)
          }
        })

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('pty:write', (_event, taskId: unknown, data: unknown) => {
    const id = SessionIdSchema.parse(taskId)
    const str = PtyWriteDataSchema.parse(data)
    const proc = sessions.get(id)
    if (proc) {
      proc.write(str)
    }
  })

  ipcMain.handle('pty:resize', (_event, taskId: unknown, cols: unknown, rows: unknown) => {
    const { cols: c, rows: r } = PtyResizeSchema.parse({ cols, rows })
    const id = SessionIdSchema.parse(taskId)
    const proc = sessions.get(id)
    if (proc) {
      proc.resize(c, r)
    }
  })

  ipcMain.handle('pty:kill', (_event, taskId: unknown) => {
    const id = SessionIdSchema.parse(taskId)
    const proc = sessions.get(id)
    if (proc) {
      proc.kill()
      sessions.delete(id)
      persistSessionPids()
    }
  })
}
