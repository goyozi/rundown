import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { reportSession } from '../commands/report-session'

let server: ReturnType<typeof Bun.serve> | null = null
let receivedRequests: { method: string; url: string; body: unknown }[] = []

function startServer(
  port: number,
  handler?: (req: Request) => Response
): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch: async (req) => {
      const body = await req.json().catch(() => null)
      receivedRequests.push({ method: req.method, url: req.url, body })
      if (handler) return handler(req)
      return Response.json({ ok: true }, { status: 200 })
    }
  })
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key]
    if (env[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = env[key]
    }
  }
  return fn().finally(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = saved[key]
      }
    }
  })
}

/**
 * Mock stdin by temporarily replacing process.stdin with a ReadableStream
 * that yields the given string as input.
 */
function withStdin(input: string, fn: () => Promise<void>): Promise<void> {
  const original = process.stdin
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input))
      controller.close()
    }
  })
  // @ts-expect-error — replacing stdin for test purposes
  process.stdin = stream
  return fn().finally(() => {
    // @ts-expect-error — restoring stdin
    process.stdin = original
  })
}

beforeEach(() => {
  receivedRequests = []
})

afterEach(() => {
  if (server) {
    server.stop(true)
    server = null
  }
})

describe('report-session', () => {
  test('happy path — reads session_id from stdin JSON, correct POST received', async () => {
    server = startServer(0)
    const port = server.port.toString()

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: port }, () =>
      withStdin(JSON.stringify({ session_id: 'session-abc' }), () => reportSession())
    )

    expect(receivedRequests).toHaveLength(1)
    expect(receivedRequests[0].method).toBe('POST')
    expect(receivedRequests[0].body).toEqual({
      taskId: 'task-1',
      sessionId: 'session-abc'
    })
  })

  test('missing RUNDOWN_TASK_ID — no HTTP request', async () => {
    server = startServer(0)
    const port = server.port.toString()

    await withEnv({ RUNDOWN_TASK_ID: undefined, RUNDOWN_API_PORT: port }, () =>
      withStdin(JSON.stringify({ session_id: 'session-abc' }), () => reportSession())
    )

    expect(receivedRequests).toHaveLength(0)
  })

  test('missing RUNDOWN_API_PORT — no HTTP request', async () => {
    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: undefined }, () =>
      withStdin(JSON.stringify({ session_id: 'session-abc' }), () => reportSession())
    )

    expect(receivedRequests).toHaveLength(0)
  })

  test('empty stdin — no HTTP request', async () => {
    server = startServer(0)
    const port = server.port.toString()

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: port }, () =>
      withStdin('', () => reportSession())
    )

    expect(receivedRequests).toHaveLength(0)
  })

  test('invalid JSON on stdin — no HTTP request', async () => {
    server = startServer(0)
    const port = server.port.toString()

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: port }, () =>
      withStdin('not json', () => reportSession())
    )

    expect(receivedRequests).toHaveLength(0)
  })

  test('stdin JSON missing session_id — no HTTP request', async () => {
    server = startServer(0)
    const port = server.port.toString()

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: port }, () =>
      withStdin(JSON.stringify({ other_field: 'value' }), () => reportSession())
    )

    expect(receivedRequests).toHaveLength(0)
  })

  test('server unreachable — logs to stderr, no crash', async () => {
    const stderrSpy: string[] = []
    const origError = console.error
    console.error = (...args: unknown[]) => stderrSpy.push(args.join(' '))

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: '19999' }, () =>
      withStdin(JSON.stringify({ session_id: 'session-abc' }), () => reportSession())
    )

    console.error = origError
    expect(stderrSpy.length).toBeGreaterThan(0)
    expect(stderrSpy[0]).toContain('rundown-cli:')
  })

  test('server returns non-200 — logs to stderr, no crash', async () => {
    server = startServer(0, () => Response.json({ error: 'bad' }, { status: 500 }))
    const port = server.port.toString()

    const stderrSpy: string[] = []
    const origError = console.error
    console.error = (...args: unknown[]) => stderrSpy.push(args.join(' '))

    await withEnv({ RUNDOWN_TASK_ID: 'task-1', RUNDOWN_API_PORT: port }, () =>
      withStdin(JSON.stringify({ session_id: 'session-abc' }), () => reportSession())
    )

    console.error = origError
    expect(stderrSpy).toContain('rundown-cli: server responded with 500')
  })
})
