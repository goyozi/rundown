import { app, shell, BrowserWindow, ipcMain, nativeTheme, session } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { registerStoreHandlers, getWindowState, saveWindowState } from './store'
import { registerPtyHandlers, killAllSessions } from './pty'
import { ThemeSchema } from './validation'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const windowState = getWindowState()

  // Create the browser window.
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(windowState.x !== undefined && windowState.y !== undefined
      ? { x: windowState.x, y: windowState.y }
      : {}),
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true
    }
  })

  mainWindow = win

  if (windowState.isMaximized) {
    win.maximize()
  }

  // Save window state on changes (debounced via resize/move end)
  function saveCurrentState(): void {
    if (win.isDestroyed()) return
    const isMaximized = win.isMaximized()
    if (!isMaximized) {
      const bounds = win.getBounds()
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false
      })
    } else {
      saveWindowState({ ...getWindowState(), isMaximized: true })
    }
  }

  win.on('resized', saveCurrentState)
  win.on('moved', saveCurrentState)
  win.on('maximize', saveCurrentState)
  win.on('unmaximize', saveCurrentState)
  win.on('close', saveCurrentState)

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        shell.openExternal(details.url)
      } else {
        console.warn('Blocked openExternal for non-HTTP URL:', details.url)
      }
    } catch {
      console.warn('Blocked openExternal for invalid URL:', details.url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.goyozi.rundown')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? "default-src 'self' http://localhost:*; script-src 'self' 'unsafe-inline' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  registerStoreHandlers()
  registerPtyHandlers(() => mainWindow)

  ipcMain.handle('theme:set', (_event, theme: unknown) => {
    nativeTheme.themeSource = ThemeSchema.parse(theme)
  })

  createWindow()

  // Check for updates after window is created (production only)
  if (!is.dev) {
    electronUpdater.autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err)
    })
    electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Auto-updater check failed:', err)
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killAllSessions()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
