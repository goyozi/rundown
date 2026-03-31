import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTheme } from '@/hooks/use-theme'
import '@xterm/xterm/css/xterm.css'

const darkTheme: ITheme = {
  background: '#0f0f14',
  foreground: '#e0e0e8',
  cursor: '#8b7cf8',
  selectionBackground: '#8b7cf833',
  black: '#1a1a24',
  red: '#fca5a5',
  green: '#86efac',
  yellow: '#fcd34d',
  blue: '#a5b4fc',
  magenta: '#d4a0fd',
  cyan: '#7eedf9',
  white: '#e0e0e8',
  brightBlack: '#4a4a5a',
  brightRed: '#fecaca',
  brightGreen: '#bbf7d0',
  brightYellow: '#fef08a',
  brightBlue: '#c7d2fe',
  brightMagenta: '#e9d5ff',
  brightCyan: '#a5f3fc',
  brightWhite: '#f0f0f8'
}

const lightTheme: ITheme = {
  background: '#f5f5f7',
  foreground: '#1c1c2e',
  cursor: '#6b5ce7',
  selectionBackground: '#6b5ce733',
  black: '#1c1c2e',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#4f46e5',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e8e8ec',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#6366f1',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#f8f8fc'
}

interface TerminalPanelProps {
  sessionId: string
  visible?: boolean
}

export function TerminalPanel({
  sessionId,
  visible = true
}: TerminalPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupDataRef = useRef<(() => void) | null>(null)
  const { resolved } = useTheme()

  const handleResize = useCallback(() => {
    const fit = fitAddonRef.current
    const term = terminalRef.current
    if (fit && term) {
      try {
        fit.fit()
        window.api.ptyResize(sessionId, term.cols, term.rows)
      } catch {
        // ignore resize errors during teardown
      }
    }
  }, [sessionId])

  // Update terminal theme when resolved theme changes
  useEffect(() => {
    const term = terminalRef.current
    if (term) {
      term.options.theme = resolved === 'dark' ? darkTheme : lightTheme
    }
  }, [resolved])

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let snapshotApplied = false
    const pendingLiveData: string[] = []

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: resolved === 'dark' ? darkTheme : lightTheme,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const webLinksAddon = new WebLinksAddon((e, url) => {
      if (e.metaKey) window.api.openExternal(url)
    })
    term.loadAddon(webLinksAddon)

    term.open(containerRef.current)

    // Small delay to ensure container is laid out before fitting
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        window.api.ptyResize(sessionId, term.cols, term.rows)
        term.focus()
      } catch {
        // ignore
      }
    })

    // Intercept Shift+Enter to send proper CSI u escape sequence
    // (xterm.js sends plain \r for both Enter and Shift+Enter by default).
    // Must block all event types (keydown, keypress, keyup) — otherwise the
    // keypress event slips through and xterm emits an extra \r that submits the input.
    term.attachCustomKeyEventHandler((event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        if (event.type === 'keydown') {
          window.api.ptyWrite(sessionId, '\x1b[13;2u')
        }
        return false
      }
      return true
    })

    // Forward keystrokes to PTY
    term.onData((data) => {
      window.api.ptyWrite(sessionId, data)
    })

    // 1. Register live listener FIRST — queue until snapshot applied
    const cleanupData = window.api.onPtyData((id, data) => {
      if (id !== sessionId) return
      if (snapshotApplied) {
        term.write(data)
      } else {
        pendingLiveData.push(data)
      }
    })

    // 2. Fetch snapshot, apply, flush queued live data
    window.api.ptySnapshot(sessionId).then((snapshot) => {
      if (cancelled) return
      if (snapshot) term.write(snapshot)
      for (const chunk of pendingLiveData) term.write(chunk)
      pendingLiveData.length = 0
      snapshotApplied = true
    })

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    cleanupDataRef.current = cleanupData

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      cleanupData()
      cleanupDataRef.current = null
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, handleResize])

  // Re-fit and focus when the panel becomes visible again
  useEffect(() => {
    if (!visible) return
    const term = terminalRef.current
    const fit = fitAddonRef.current
    if (term && fit) {
      requestAnimationFrame(() => {
        try {
          fit.fit()
          window.api.ptyResize(sessionId, term.cols, term.rows)
          term.focus()
        } catch {
          // ignore
        }
      })
    }
  }, [visible, sessionId])

  const bg = resolved === 'dark' ? '#0f0f14' : '#f5f5f7'

  return (
    <div
      className="flex-1 min-h-0 overflow-hidden"
      style={{
        padding: '8px 4px 4px 8px',
        background: bg,
        display: visible ? undefined : 'none'
      }}
      data-testid="terminal-panel"
      data-session-id={sessionId}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
