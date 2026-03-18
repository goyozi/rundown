import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createSessionServer } from '../server'
import { buildClaudeSpawnParams, type SessionResumeDeps } from '../pty'
import type { SessionStore } from '../store'
import type { Task } from '../../shared/types'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    description: 'Test task',
    state: 'idle',
    children: [],
    createdAt: new Date().toISOString(),
    groupId: 'group-1',
    ...overrides
  }
}

function createMockStore(tasks: Task[] = []): SessionStore {
  let stored = [...tasks]
  return {
    getTasks: () => stored,
    setTasks: (t) => {
      stored = t
    }
  }
}

describe('Session resume end-to-end', () => {
  let server: ReturnType<typeof createSessionServer>
  let baseUrl: string
  let store: SessionStore
  let claudeBaseDir: string

  beforeEach(async () => {
    claudeBaseDir = mkdtempSync(join(tmpdir(), 'rundown-e2e-'))
    store = createMockStore([makeTask({ id: 'task-1' })])
    server = createSessionServer(store)
    const { port } = await server.start()
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await server.stop()
    rmSync(claudeBaseDir, { recursive: true, force: true })
  })

  /** Create a fake Claude session on disk as a .jsonl file */
  function createSessionOnDisk(sessionId: string): void {
    mkdirSync(join(claudeBaseDir, 'projects', 'some-project'), { recursive: true })
    writeFileSync(join(claudeBaseDir, 'projects', 'some-project', `${sessionId}.jsonl`), '')
  }

  it('full lifecycle: spawn → report session → spawn with --resume', async () => {
    const port = parseInt(new URL(baseUrl).port, 10)

    // Build deps that read from our mock store
    const deps: SessionResumeDeps = {
      getTaskSessionId: (taskId) => store.getTasks().find((t) => t.id === taskId)?.sessionId,
      clearTaskSessionId: (taskId) => {
        const tasks = store.getTasks()
        const task = tasks.find((t) => t.id === taskId)
        if (task) {
          task.sessionId = undefined
          store.setTasks(tasks)
        }
      },
      getServerPort: () => port,
      isSessionResumeEnabled: () => true,
      claudeBaseDir
    }

    // 1. First spawn: no sessionId yet → no --resume, env vars present
    const first = buildClaudeSpawnParams('task-1', deps)
    expect(first.args).toEqual([])
    expect(first.extraEnv.RUNDOWN_TASK_ID).toBe('task-1')
    expect(first.extraEnv.RUNDOWN_API_PORT).toBe(String(port))

    // 2. CLI hook reports session ID via HTTP
    const res1 = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', sessionId: 'sess-first' })
    })
    expect(res1.status).toBe(200)

    // 3. Verify sessionId stored
    expect(store.getTasks().find((t) => t.id === 'task-1')?.sessionId).toBe('sess-first')

    // 4. Simulate Claude writing session to disk, then second spawn uses --resume
    createSessionOnDisk('sess-first')
    const second = buildClaudeSpawnParams('task-1', deps)
    expect(second.args).toEqual(['--resume', 'sess-first'])
    expect(second.extraEnv.RUNDOWN_TASK_ID).toBe('task-1')
    expect(second.extraEnv.RUNDOWN_API_PORT).toBe(String(port))

    // 5. CLI hook reports updated session ID
    const res2 = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', sessionId: 'sess-second' })
    })
    expect(res2.status).toBe(200)

    // 6. Stored value updated
    expect(store.getTasks().find((t) => t.id === 'task-1')?.sessionId).toBe('sess-second')
  })
})
