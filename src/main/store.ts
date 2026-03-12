import { ipcMain, dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import type { Task } from '../shared/types'

interface StoreSchema {
  tasks: Task[]
}

const storeOptions: ConstructorParameters<typeof Store<StoreSchema>>[0] = {
  defaults: {
    tasks: []
  }
}

if (process.env.ELECTRON_STORE_PATH) {
  storeOptions.cwd = process.env.ELECTRON_STORE_PATH
}

const store = new Store<StoreSchema>(storeOptions)

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get-tasks', () => {
    return store.get('tasks')
  })

  ipcMain.handle('store:save-tasks', (_event, tasks: Task[]) => {
    store.set('tasks', tasks)
  })

  ipcMain.handle('dialog:open-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })
}
