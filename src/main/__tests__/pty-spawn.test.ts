import { describe, it, expect } from 'vitest'
import { buildClaudeSpawnParams, type SessionResumeDeps } from '../pty'

function makeDeps(overrides: Partial<SessionResumeDeps> = {}): SessionResumeDeps {
  return {
    getTaskSessionId: () => undefined,
    getServerPort: () => 9999,
    isSessionResumeEnabled: () => true,
    ...overrides
  }
}

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

  it('adds --resume <sessionId> when enabled and sessionId exists', () => {
    const deps = makeDeps({ getTaskSessionId: () => 'sess-abc' })
    const result = buildClaudeSpawnParams('task-1', deps)
    expect(result).toEqual({
      args: ['--resume', 'sess-abc'],
      extraEnv: { RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: '9999' }
    })
  })
})
