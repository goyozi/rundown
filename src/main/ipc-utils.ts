import { ipcMain } from 'electron'
import log from './logger'

/**
 * Wraps ipcMain.handle with try/catch error logging.
 * Logs errors via electron-log, then re-throws so the renderer
 * receives a rejection (rather than silent swallowing).
 */
export function safeHandle(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await handler(...args)
    } catch (err) {
      log.error(`[IPC] ${channel} failed:`, err)
      throw err
    }
  })
}
