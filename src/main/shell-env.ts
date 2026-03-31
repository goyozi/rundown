import { execFileSync } from 'child_process'
import { app } from 'electron'
import log from './logger'

let resolvedEnv: Record<string, string> | null = null

/**
 * Parse null-delimited `env -0` output into a key-value map.
 */
function parseEnvOutput(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  // env -0 separates entries with \0; the last entry may have a trailing \0
  for (const entry of raw.split('\0')) {
    if (!entry) continue
    const eqIdx = entry.indexOf('=')
    if (eqIdx === -1) continue
    env[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1)
  }
  return env
}

/**
 * Attempt to resolve the user's full login-shell environment.
 * Returns null on failure — callers should fall back to process.env.
 */
function resolveOnce(): Record<string, string> | null {
  // Only needed when launched from a desktop launcher (packaged app).
  // In dev mode or on Windows, process.env is already correct.
  if (!app.isPackaged || (process.platform !== 'darwin' && process.platform !== 'linux')) {
    return null
  }

  try {
    const loginShell = process.env.SHELL || '/bin/zsh'
    const result = execFileSync(loginShell, ['-ilc', 'env -0'], {
      encoding: 'utf-8',
      timeout: 5000,
      // Prevent the shell from reading from stdin (hangs at login)
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
    if (result) {
      return parseEnvOutput(result)
    }
  } catch (err) {
    log.warn('Shell env resolution failed, will retry on next PTY spawn', err)
  }
  return null
}

/**
 * Get the user's full shell environment, resolved lazily on first call.
 * If resolution fails, retries on subsequent calls.
 * Falls back to process.env if resolution has never succeeded.
 */
export function getShellEnv(): Record<string, string> {
  if (resolvedEnv) return resolvedEnv

  const env = resolveOnce()
  if (env) {
    resolvedEnv = env
    return resolvedEnv
  }

  // Not resolved yet — return process.env as a fallback
  const fallback: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) fallback[key] = value
  }
  return fallback
}

/** Exported for testing */
export function _resetForTesting(): void {
  resolvedEnv = null
}

export { parseEnvOutput as _parseEnvOutputForTesting }
