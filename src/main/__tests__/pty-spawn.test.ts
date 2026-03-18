import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildClaudeSpawnParams, claudeSessionExistsOnDisk, type SessionResumeDeps } from '../pty'

const PROJECT = 'some-project'
let claudeBaseDir: string

beforeEach(() => {
  claudeBaseDir = mkdtempSync(join(tmpdir(), 'rundown-test-'))
  // Create the project directory structure
  mkdirSync(join(claudeBaseDir, 'projects', PROJECT), { recursive: true })
})

afterEach(() => {
  rmSync(claudeBaseDir, { recursive: true, force: true })
})

function makeDeps(overrides: Partial<SessionResumeDeps> = {}): SessionResumeDeps {
  return {
    getTaskSessionId: () => undefined,
    clearTaskSessionId: () => {},
    getServerPort: () => 9999,
    isSessionResumeEnabled: () => true,
    claudeBaseDir,
    ...overrides
  }
}

/** Create a fake session as a .jsonl file */
function createSessionJsonl(sessionId: string): void {
  writeFileSync(join(claudeBaseDir, 'projects', PROJECT, `${sessionId}.jsonl`), '')
}

/** Create a fake session as a directory */
function createSessionDir(sessionId: string): void {
  mkdirSync(join(claudeBaseDir, 'projects', PROJECT, sessionId))
}

describe('claudeSessionExistsOnDisk', () => {
  it('returns true when session exists as .jsonl file', () => {
    createSessionJsonl('sess-1')
    expect(claudeSessionExistsOnDisk('sess-1', claudeBaseDir)).toBe(true)
  })

  it('returns true when session exists as directory', () => {
    createSessionDir('sess-2')
    expect(claudeSessionExistsOnDisk('sess-2', claudeBaseDir)).toBe(true)
  })

  it('returns true when session exists as both .jsonl and directory', () => {
    createSessionJsonl('sess-3')
    createSessionDir('sess-3')
    expect(claudeSessionExistsOnDisk('sess-3', claudeBaseDir)).toBe(true)
  })

  it('returns false when session does not exist', () => {
    expect(claudeSessionExistsOnDisk('sess-missing', claudeBaseDir)).toBe(false)
  })

  it('returns false when projects dir does not exist', () => {
    rmSync(join(claudeBaseDir, 'projects'), { recursive: true })
    expect(claudeSessionExistsOnDisk('sess-1', claudeBaseDir)).toBe(false)
  })
})

describe('buildClaudeSpawnParams', () => {
  it('returns empty args/env when deps is undefined', () => {
    const result = buildClaudeSpawnParams('task-1')
    expect(result).toEqual({ args: [], extraEnv: {} })
  })

  it('returns empty args/env when session resume is disabled', () => {
    const deps = makeDeps({ isSessionResumeEnabled: () => false })
    const result = buildClaudeSpawnParams('task-1', deps)
    expect(result).toEqual({ args: [], extraEnv: {} })
  })

  it('sets env vars but no --resume when enabled with no existing sessionId', () => {
    const deps = makeDeps({ getTaskSessionId: () => undefined })
    const result = buildClaudeSpawnParams('task-1', deps)
    expect(result).toEqual({
      args: [],
      extraEnv: { RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: '9999' }
    })
  })

  it('adds --resume when sessionId exists and session is on disk', () => {
    createSessionJsonl('sess-abc')
    const deps = makeDeps({ getTaskSessionId: () => 'sess-abc' })
    const result = buildClaudeSpawnParams('task-1', deps)
    expect(result).toEqual({
      args: ['--resume', 'sess-abc'],
      extraEnv: { RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: '9999' }
    })
  })

  it('skips --resume and clears stale sessionId when session is not on disk', () => {
    const clearFn = vi.fn()
    const deps = makeDeps({
      getTaskSessionId: () => 'sess-stale',
      clearTaskSessionId: clearFn
    })
    const result = buildClaudeSpawnParams('task-1', deps)
    expect(result).toEqual({
      args: [],
      extraEnv: { RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: '9999' }
    })
    expect(clearFn).toHaveBeenCalledWith('task-1')
  })
})
