import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { enableSessionHook, disableSessionHook, isSessionHookEnabled } from '../claude-config'

const CLI_PATH = '/usr/local/bin/rundown-cli'

function settingsPath(dir: string): string {
  return join(dir, 'settings.json')
}

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writeJSON(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

describe('claude-config', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-config-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('enableSessionHook', () => {
    it('creates settings.json when file is missing', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)

      const data = readJSON(path)
      expect(data.hooks).toEqual({
        SessionStart: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: `${CLI_PATH} report-session`
              }
            ]
          }
        ]
      })
    })

    it('adds hook structure to empty file', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {})
      enableSessionHook(path, CLI_PATH)

      const data = readJSON(path) as { hooks: { SessionStart: unknown[] } }
      expect(data.hooks.SessionStart).toHaveLength(1)
    })

    it('appends to existing SessionStart hooks', () => {
      const path = settingsPath(tmpDir)
      const existingHook = {
        matcher: '',
        hooks: [{ type: 'command', command: 'echo hello' }]
      }
      writeJSON(path, { hooks: { SessionStart: [existingHook] } })

      enableSessionHook(path, CLI_PATH)

      const data = readJSON(path) as { hooks: { SessionStart: unknown[] } }
      expect(data.hooks.SessionStart).toHaveLength(2)
      expect(data.hooks.SessionStart[0]).toEqual(existingHook)
    })

    it('preserves other hook types', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {
        hooks: { PreToolUse: [{ matcher: '', hooks: [] }] }
      })

      enableSessionHook(path, CLI_PATH)

      const data = readJSON(path) as { hooks: Record<string, unknown> }
      expect(data.hooks.PreToolUse).toBeDefined()
      expect(data.hooks.SessionStart).toBeDefined()
    })

    it('is idempotent — does not add duplicate', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)
      enableSessionHook(path, CLI_PATH)

      const data = readJSON(path) as { hooks: { SessionStart: unknown[] } }
      expect(data.hooks.SessionStart).toHaveLength(1)
    })
  })

  describe('disableSessionHook', () => {
    it('removes Rundown hook and preserves others', () => {
      const path = settingsPath(tmpDir)
      const otherHook = {
        matcher: '',
        hooks: [{ type: 'command', command: 'echo hello' }]
      }
      writeJSON(path, {
        hooks: {
          SessionStart: [
            otherHook,
            {
              matcher: '',
              hooks: [
                {
                  type: 'command',
                  command: `${CLI_PATH} report-session`
                }
              ]
            }
          ]
        }
      })

      disableSessionHook(path)

      const data = readJSON(path) as { hooks: { SessionStart: unknown[] } }
      expect(data.hooks.SessionStart).toHaveLength(1)
      expect(data.hooks.SessionStart[0]).toEqual(otherHook)
    })

    it('removes SessionStart key when array becomes empty', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)
      disableSessionHook(path)

      const data = readJSON(path) as { hooks?: Record<string, unknown> }
      expect(data.hooks).toBeUndefined()
    })

    it('removes hooks key when object becomes empty', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'rundown-cli report-session' }]
            }
          ]
        }
      })

      disableSessionHook(path)

      const data = readJSON(path)
      expect(data.hooks).toBeUndefined()
    })

    it('is a no-op when hook is not present', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {
        hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] }
      })

      disableSessionHook(path)

      const data = readJSON(path) as { hooks: { SessionStart: unknown[] } }
      expect(data.hooks.SessionStart).toHaveLength(1)
    })

    it('is a no-op when file is missing', () => {
      const path = settingsPath(tmpDir)
      expect(() => disableSessionHook(path)).not.toThrow()
    })
  })

  describe('isSessionHookEnabled', () => {
    it('returns true when hook is present', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)
      expect(isSessionHookEnabled(path)).toBe(true)
    })

    it('returns false when hook is not present', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {})
      expect(isSessionHookEnabled(path)).toBe(false)
    })

    it('returns false when file is missing', () => {
      const path = settingsPath(tmpDir)
      expect(isSessionHookEnabled(path)).toBe(false)
    })
  })

  describe('atomic write', () => {
    it('produces valid JSON after write', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)

      const raw = readFileSync(path, 'utf-8')
      expect(() => JSON.parse(raw)).not.toThrow()
    })

    it('creates parent directory if missing', () => {
      const nestedPath = join(tmpDir, 'nested', 'dir', 'settings.json')
      enableSessionHook(nestedPath, CLI_PATH)

      const data = readJSON(nestedPath)
      expect(data.hooks).toBeDefined()
    })
  })

  describe('startup sync (isSessionHookEnabled)', () => {
    it('detects hook present when store says disabled', () => {
      const path = settingsPath(tmpDir)
      enableSessionHook(path, CLI_PATH)
      // Store would say sessionResume: false, but file has the hook
      expect(isSessionHookEnabled(path)).toBe(true)
    })

    it('detects hook absent when store says enabled', () => {
      const path = settingsPath(tmpDir)
      writeJSON(path, {})
      // Store would say sessionResume: true, but file lacks the hook
      expect(isSessionHookEnabled(path)).toBe(false)
    })
  })
})
