import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const RUNDOWN_IDENTIFIER = 'rundown-cli'

interface HookEntry {
  matcher: string
  hooks: { type: string; command: string }[]
}

interface ClaudeSettings {
  hooks?: {
    SessionStart?: HookEntry[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

function readSettings(settingsPath: string): ClaudeSettings {
  if (!existsSync(settingsPath)) return {}
  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(raw) as ClaudeSettings
  } catch (err) {
    console.error('Failed to read Claude settings:', err)
    return {}
  }
}

function atomicWrite(settingsPath: string, data: ClaudeSettings): void {
  mkdirSync(dirname(settingsPath), { recursive: true })
  const tmp = settingsPath + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  renameSync(tmp, settingsPath)
}

function isRundownHook(entry: HookEntry): boolean {
  return entry.hooks?.some((h) => h.command.includes(RUNDOWN_IDENTIFIER)) ?? false
}

export function enableSessionHook(settingsPath: string, cliBinaryPath: string): void {
  const settings = readSettings(settingsPath)

  const startSession = settings.hooks?.SessionStart ?? []
  if (startSession.some(isRundownHook)) return

  const hookEntry: HookEntry = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `${cliBinaryPath} report-session`
      }
    ]
  }

  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = []
  settings.hooks.SessionStart.push(hookEntry)

  atomicWrite(settingsPath, settings)
}

export function disableSessionHook(settingsPath: string): void {
  if (!existsSync(settingsPath)) return

  const settings = readSettings(settingsPath)
  const startSession = settings.hooks?.SessionStart
  if (!startSession) return

  const filtered = startSession.filter((entry) => !isRundownHook(entry))

  if (filtered.length === 0) {
    delete settings.hooks!.SessionStart
  } else {
    settings.hooks!.SessionStart = filtered
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks
  }

  atomicWrite(settingsPath, settings)
}

export function isSessionHookEnabled(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false
  const settings = readSettings(settingsPath)
  return settings.hooks?.SessionStart?.some(isRundownHook) ?? false
}
