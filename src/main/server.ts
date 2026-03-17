import http from 'node:http'
import { SessionReportSchema } from './validation'
import type { SessionStore } from './store'

export function createSessionServer(store: SessionStore): {
  start(): Promise<{ port: number }>
  stop(): Promise<void>
} {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/sessions') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    let body = ''
    let aborted = false
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 65536) {
        aborted = true
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Payload too large' }))
        req.destroy()
      }
    })

    req.on('end', () => {
      if (aborted) return
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      const result = SessionReportSchema.safeParse(parsed)
      if (!result.success) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Validation failed', details: result.error.issues }))
        return
      }

      const { taskId, sessionId } = result.data
      const tasks = store.getTasks()
      const taskIndex = tasks.findIndex((t) => t.id === taskId)

      if (taskIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Task not found' }))
        return
      }

      tasks[taskIndex] = { ...tasks[taskIndex], sessionId }
      store.setTasks(tasks)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    })
  })

  return {
    start(): Promise<{ port: number }> {
      return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address()
          if (addr && typeof addr === 'object') {
            resolve({ port: addr.port })
          } else {
            reject(new Error('Failed to get server address'))
          }
        })
        server.once('error', reject)
      })
    },
    stop(): Promise<void> {
      return new Promise((resolve) => {
        server.close(() => resolve())
      })
    }
  }
}
