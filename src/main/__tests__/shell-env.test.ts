import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron's app before importing the module
vi.mock('electron', () => ({
  app: { isPackaged: true }
}))

// Mock logger
vi.mock('../logger', () => ({
  default: { warn: vi.fn() }
}))

// Mock child_process
const execFileSyncMock = vi.fn()
vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args)
}))

import { getShellEnv, _resetForTesting, _parseEnvOutputForTesting } from '../shell-env'
import { app } from 'electron'

beforeEach(() => {
  _resetForTesting()
  execFileSyncMock.mockReset()
})

const savedPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: savedPlatform })
})

function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p })
}

describe('parseEnvOutput', () => {
  it('parses null-delimited env output', () => {
    const raw = 'HOME=/Users/me\0PATH=/usr/bin:/bin\0SHELL=/bin/zsh\0'
    const result = _parseEnvOutputForTesting(raw)
    expect(result).toEqual({
      HOME: '/Users/me',
      PATH: '/usr/bin:/bin',
      SHELL: '/bin/zsh'
    })
  })

  it('handles values containing = signs', () => {
    const raw = 'FOO=bar=baz\0'
    const result = _parseEnvOutputForTesting(raw)
    expect(result).toEqual({ FOO: 'bar=baz' })
  })

  it('handles empty string', () => {
    expect(_parseEnvOutputForTesting('')).toEqual({})
  })

  it('skips entries without = sign', () => {
    const raw = 'VALID=yes\0invalid\0ALSO_VALID=yes\0'
    const result = _parseEnvOutputForTesting(raw)
    expect(result).toEqual({ VALID: 'yes', ALSO_VALID: 'yes' })
  })
})

describe('getShellEnv', () => {
  it('resolves full shell env on macOS packaged app', () => {
    setPlatform('darwin')
    execFileSyncMock.mockReturnValue('HOME=/Users/me\0PATH=/usr/local/bin:/usr/bin\0')

    const env = getShellEnv()

    expect(env).toEqual({ HOME: '/Users/me', PATH: '/usr/local/bin:/usr/bin' })
    expect(execFileSyncMock).toHaveBeenCalledWith(
      expect.any(String),
      ['-ilc', 'env -0'],
      expect.objectContaining({ timeout: 5000 })
    )
  })

  it('caches resolved env on subsequent calls', () => {
    setPlatform('darwin')
    execFileSyncMock.mockReturnValue('FOO=bar\0')

    getShellEnv()
    getShellEnv()

    expect(execFileSyncMock).toHaveBeenCalledTimes(1)
  })

  it('retries on next call if resolution fails', () => {
    setPlatform('darwin')
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error('timeout')
      })
      .mockReturnValueOnce('FOO=bar\0')

    // First call fails — returns process.env fallback
    const first = getShellEnv()
    expect(first).not.toHaveProperty('FOO')

    // Second call retries and succeeds
    const second = getShellEnv()
    expect(second).toEqual({ FOO: 'bar' })
    expect(execFileSyncMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to process.env when not packaged', () => {
    ;(app as { isPackaged: boolean }).isPackaged = false
    setPlatform('darwin')

    const env = getShellEnv()

    expect(execFileSyncMock).not.toHaveBeenCalled()
    expect(env).toHaveProperty('PATH')

    // Restore
    ;(app as { isPackaged: boolean }).isPackaged = true
  })

  it('resolves full shell env on Linux packaged app', () => {
    setPlatform('linux')
    execFileSyncMock.mockReturnValue('HOME=/home/me\0PATH=/usr/local/bin:/usr/bin\0')

    const env = getShellEnv()

    expect(env).toEqual({ HOME: '/home/me', PATH: '/usr/local/bin:/usr/bin' })
    expect(execFileSyncMock).toHaveBeenCalled()
  })

  it('falls back to process.env on Windows', () => {
    setPlatform('win32')

    const env = getShellEnv()

    expect(execFileSyncMock).not.toHaveBeenCalled()
    expect(env).toHaveProperty('PATH')
  })

  it('passes stdio to prevent stdin hang', () => {
    setPlatform('darwin')
    execFileSyncMock.mockReturnValue('X=1\0')

    getShellEnv()

    expect(execFileSyncMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    )
  })
})
