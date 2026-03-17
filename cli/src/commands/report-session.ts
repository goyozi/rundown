export async function reportSession(): Promise<void> {
  const taskId = process.env.RUNDOWN_TASK_ID
  const port = process.env.RUNDOWN_API_PORT

  if (!taskId || !port) {
    return
  }

  const sessionId = await readSessionIdFromStdin()
  if (!sessionId) {
    return
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, sessionId })
    })

    if (!res.ok) {
      console.error(`rundown-cli: server responded with ${res.status}`)
    }
  } catch (err) {
    console.error(`rundown-cli: ${err instanceof Error ? err.message : err}`)
  }
}

async function readSessionIdFromStdin(): Promise<string | undefined> {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    const input = Buffer.concat(chunks).toString('utf-8').trim()
    if (!input) return undefined
    const data = JSON.parse(input)
    return typeof data.session_id === 'string' ? data.session_id : undefined
  } catch {
    return undefined
  }
}
