import { describe, it, expect } from 'vitest'
import { PtyTerminalBuffer } from '../pty-buffer'

function writeAndFlush(buf: PtyTerminalBuffer, data: string): Promise<void> {
  return new Promise((resolve) => buf.write(data, resolve))
}

describe('PtyTerminalBuffer', () => {
  it('serialize returns empty string on fresh buffer', () => {
    const buf = new PtyTerminalBuffer()
    expect(buf.serialize()).toBe('')
    buf.dispose()
  })

  it('write + serialize returns content that reproduces terminal state', async () => {
    const buf = new PtyTerminalBuffer()
    await writeAndFlush(buf, 'hello world')
    const snapshot = buf.serialize()
    expect(snapshot).toContain('hello world')
    buf.dispose()
  })

  it('multiple writes accumulate correctly', async () => {
    const buf = new PtyTerminalBuffer()
    await writeAndFlush(buf, 'line1\r\n')
    await writeAndFlush(buf, 'line2\r\n')
    await writeAndFlush(buf, 'line3')
    const snapshot = buf.serialize()
    expect(snapshot).toContain('line1')
    expect(snapshot).toContain('line2')
    expect(snapshot).toContain('line3')
    buf.dispose()
  })

  it('handles escape sequences (colors)', async () => {
    const buf = new PtyTerminalBuffer()
    await writeAndFlush(buf, '\x1b[31mred text\x1b[0m')
    const snapshot = buf.serialize()
    expect(snapshot).toContain('red text')
    buf.dispose()
  })

  it('handles cursor movement escape sequences', async () => {
    const buf = new PtyTerminalBuffer()
    await writeAndFlush(buf, 'AAAA\r\nBBBB')
    // Move cursor up one line, right 2 cols, and write X
    await writeAndFlush(buf, '\x1b[1A\x1b[2CX')
    const snapshot = buf.serialize()
    // Serialized output reproduces the state via escape sequences
    expect(snapshot).toContain('AAAA')
    expect(snapshot).toContain('BBBB')
    expect(snapshot).toContain('X')
    buf.dispose()
  })

  it('resize changes terminal dimensions', async () => {
    const buf = new PtyTerminalBuffer(80, 24)
    buf.resize(120, 40)
    await writeAndFlush(buf, 'after resize')
    const snapshot = buf.serialize()
    expect(snapshot).toContain('after resize')
    buf.dispose()
  })

  it('dispose cleans up without errors', async () => {
    const buf = new PtyTerminalBuffer()
    await writeAndFlush(buf, 'some data')
    expect(() => buf.dispose()).not.toThrow()
  })
})
