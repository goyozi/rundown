import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useTheme } from '@/hooks/use-theme'
import '@xterm/xterm/css/xterm.css'

const darkTheme: ITheme = {
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
  taskId: string
}

export function TerminalPanel({ taskId }: TerminalPanelProps): React.JSX.Element {
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
        window.api.ptyResize(taskId, term.cols, term.rows)
      } catch {
        // ignore resize errors during teardown
      }
    }
  }, [taskId])

  // Update terminal theme when resolved theme changes
  useEffect(() => {
    const term = terminalRef.current
    if (term) {
      term.options.theme = resolved === 'dark' ? darkTheme : lightTheme
    }
  }, [resolved])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: resolved === 'dark' ? darkTheme : lightTheme,
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
  }, [taskId, handleResize, resolved])

  const bg = resolved === 'dark' ? '#0f0f14' : '#f5f5f7'

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0"
      style={{ padding: '8px 4px 4px 8px', background: bg }}
      data-testid="terminal-panel"
    />
  )
}
