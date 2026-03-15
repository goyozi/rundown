import { ElectronApplication } from 'playwright'

/** Mock the native directory picker to return the given path */
export async function mockOpenDirectory(app: ElectronApplication, dirPath: string): Promise<void> {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [dir] }) as ReturnType<
        typeof dialog.showOpenDialog
      >
  }, dirPath)
}
