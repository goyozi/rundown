import { useState, useCallback } from 'react'

interface UseDirectoryPickerOpts {
  onValid: (dir: string) => void
  canPick?: () => boolean
}

interface UseDirectoryPickerReturn {
  pickDirectory: () => Promise<void>
  dirError: string | null
  clearDirError: () => void
}

export function useDirectoryPicker({
  onValid,
  canPick
}: UseDirectoryPickerOpts): UseDirectoryPickerReturn {
  const [dirError, setDirError] = useState<string | null>(null)

  const pickDirectory = useCallback(async (): Promise<void> => {
    if (canPick && !canPick()) return
    const dir = await window.api.openDirectory()
    if (dir) {
      const result = await window.api.validateRepo(dir)
      if (result.valid) {
        setDirError(null)
        onValid(dir)
      } else {
        setDirError(result.error ?? 'Invalid directory')
      }
    }
  }, [onValid, canPick])

  const clearDirError = useCallback(() => setDirError(null), [])

  return { pickDirectory, dirError, clearDirError }
}
