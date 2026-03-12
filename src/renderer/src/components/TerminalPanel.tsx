import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  taskId: string
}

export function TerminalPanel({ taskId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupDataRef = useRef<(() => void) | null>(null)

  const handleResize = useCallback(() => {
    const fit = fitAddonRef.current
    const term = terminalRef.current
    if (fit && term) {
      try {
        fit.fit()
        window.api.ptyResize(taskId, term.cols, term.rows)
      } catch {
        // ignore resize errors during teardown
      }
    }
  }, [taskId])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#0f0f14',
        foreground: '#e0e0e8',
        cursor: '#8b7cf8',
        selectionBackground: '#8b7cf833',
        black: '#1a1a24',
        red: '#f87171',
        green: '#6ee7b7',
        yellow: '#fbbf24',
        blue: '#818cf8',
        magenta: '#c084fc',
        cyan: '#67e8f9',
        white: '#e0e0e8',
        brightBlack: '#3a3a4a',
        brightRed: '#fca5a5',
        brightGreen: '#a7f3d0',
        brightYellow: '#fde68a',
        brightBlue: '#a5b4fc',
        brightMagenta: '#d8b4fe',
        brightCyan: '#a5f3fc',
        brightWhite: '#f0f0f8'
      },
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)

    // Small delay to ensure container is laid out before fitting
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        window.api.ptyResize(taskId, term.cols, term.rows)
      } catch {
        // ignore
      }
    })

    // Forward keystrokes to PTY
    term.onData((data) => {
      window.api.ptyWrite(taskId, data)
    })

    // Listen for PTY data
    const cleanupData = window.api.onPtyData((id, data) => {
      if (id === taskId) {
        term.write(data)
      }
    })

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    cleanupDataRef.current = cleanupData

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      cleanupData()
      cleanupDataRef.current = null
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [taskId, handleResize])

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0"
      style={{ padding: '8px 4px 4px 8px', background: '#0f0f14' }}
      data-testid="terminal-panel"
    />
  )
}
