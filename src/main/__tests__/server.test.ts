import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSessionServer } from '../server'
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

describe('Session Server', () => {
  let server: ReturnType<typeof createSessionServer>
  let baseUrl: string
  let store: SessionStore

  beforeEach(async () => {
    store = createMockStore([makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })])
    server = createSessionServer(store)
    const { port } = await server.start()
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await server.stop()
  })

  it('persists sessionId on valid POST', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', sessionId: 'sess-abc' })
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })

    const tasks = store.getTasks()
    expect(tasks.find((t) => t.id === 'task-1')?.sessionId).toBe('sess-abc')
  })

  it('returns 400 for missing taskId', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-abc' })
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for missing sessionId', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' })
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for empty strings', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: '', sessionId: '' })
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json'
    })

    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown taskId', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'nonexistent', sessionId: 'sess-abc' })
    })

    expect(res.status).toBe(404)
  })

  it('handles concurrent POSTs for different tasks', async () => {
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-1', sessionId: 'sess-1' })
      }),
      fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task-2', sessionId: 'sess-2' })
      })
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    // Node's event loop serializes the req.on('end') callbacks, so both
    // read-modify-write cycles complete without interleaving.
    const tasks = store.getTasks()
    expect(tasks.find((t) => t.id === 'task-1')?.sessionId).toBe('sess-1')
    expect(tasks.find((t) => t.id === 'task-2')?.sessionId).toBe('sess-2')
  })

  it('returns 404 for GET request', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for unknown route', async () => {
    const res = await fetch(`${baseUrl}/api/unknown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1', sessionId: 'sess-abc' })
    })

    expect(res.status).toBe(404)
  })

  it('returns 413 for oversized payload', async () => {
    const hugeBody = JSON.stringify({ taskId: 'task-1', sessionId: 'x'.repeat(100_000) })
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hugeBody
    })

    expect(res.status).toBe(413)
  })
})
