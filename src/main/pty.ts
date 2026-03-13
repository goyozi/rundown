import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'

const sessions = new Map<string, pty.IPty>()

export function killAllSessions(): void {
  for (const [id, proc] of sessions) {
    proc.kill()
    sessions.delete(id)
  }
}

export function registerPtyHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    'pty:spawn',
    (_event, taskId: string, cwd: string, theme: 'light' | 'dark' = 'dark') => {
      if (sessions.has(taskId)) {
        return { success: false, error: 'Session already active for this task' }
      }

      const claudeBin = process.env.CLAUDE_BIN ?? 'claude'
      const shell = claudeBin

      // COLORFGBG hints to CLI apps about the terminal background:
      // "0;15" = dark fg on light bg (light mode), "15;0" = light fg on dark bg (dark mode)
      const colorfgbg = theme === 'light' ? '0;15' : '15;0'

      try {
        const ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd,
          env: {
            ...process.env,
            CLAUDE_STUB_SCRIPT: process.env.CLAUDE_STUB_SCRIPT,
            COLORFGBG: colorfgbg
          } as Record<string, string>
        })

        sessions.set(taskId, ptyProcess)

        ptyProcess.onData((data) => {
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('pty:data', taskId, data)
          }
        })

        ptyProcess.onExit(() => {
          sessions.delete(taskId)
          const win = getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('pty:exit', taskId)
          }
        })

        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('pty:write', (_event, taskId: string, data: string) => {
    const proc = sessions.get(taskId)
    if (proc) {
      proc.write(data)
    }
  })

  ipcMain.handle('pty:resize', (_event, taskId: string, cols: number, rows: number) => {
    const proc = sessions.get(taskId)
    if (proc) {
      proc.resize(cols, rows)
    }
  })

  ipcMain.handle('pty:kill', (_event, taskId: string) => {
    const proc = sessions.get(taskId)
    if (proc) {
      proc.kill()
      sessions.delete(taskId)
    }
  })
}
