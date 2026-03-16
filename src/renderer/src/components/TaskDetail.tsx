import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ListTodo, Terminal, AlertCircle, BotMessageSquare } from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { useTheme } from '@/hooks/use-theme'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { TerminalPanel } from './TerminalPanel'
import { ReviewPanel } from './ReviewPanel'
import { TaskHeader } from './TaskHeader'
import { TabBar } from './TabBar'
import type { DetailTab, ShellTab } from './TabBar'

type DiffMode = 'uncommitted' | 'branch'

export function TaskDetail(): React.JSX.Element | null {
  const shellCounterRef = useRef(0)
  const {
    selectedTaskId,
    task,
    effectiveDir,
    updateDirectory,
    activeSessions,
    startSession,
    stopSession
  } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      task: s.selectedTaskId ? s.getTask(s.selectedTaskId) : undefined,
      effectiveDir: s.selectedTaskId ? s.getEffectiveDirectory(s.selectedTaskId) : undefined,
      updateDirectory: s.updateDirectory,
      activeSessions: s.activeSessions,
      startSession: s.startSession,
      stopSession: s.stopSession
    }))
  )
  const { resolved } = useTheme()
  const [dirError, setDirError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [tabPerTask, setTabPerTask] = useState<Record<string, DetailTab>>({})
  const [modePerTask, setModePerTask] = useState<Record<string, DiffMode>>({})
  const [shellTabsPerTask, setShellTabsPerTask] = useState<Record<string, ShellTab[]>>({})

  const activeTab = (selectedTaskId && tabPerTask[selectedTaskId]) || 'claude'
  const setActiveTab = useCallback(
    (tab: DetailTab): void => {
      if (selectedTaskId) {
        setTabPerTask((prev) => ({ ...prev, [selectedTaskId]: tab }))
      }
    },
    [selectedTaskId]
  )
  const shellTabs = (selectedTaskId && shellTabsPerTask[selectedTaskId]) || []

  const diffMode: DiffMode = (selectedTaskId && modePerTask[selectedTaskId]) || 'uncommitted'
  const setDiffMode = useCallback(
    (mode: DiffMode): void => {
      if (selectedTaskId) {
        setModePerTask((prev) => ({ ...prev, [selectedTaskId]: mode }))
      }
    },
    [selectedTaskId]
  )

  // Clean up shell tab when its PTY process exits naturally (e.g. user types `exit`)
  useEffect(() => {
    const cleanup = window.api.onPtyExit((exitedSessionId) => {
      if (!exitedSessionId.includes(':shell-')) return

      setShellTabsPerTask((prev) => {
        const updated = { ...prev }
        for (const [taskId, tabs] of Object.entries(updated)) {
          const match = tabs.find((t) => t.sessionId === exitedSessionId)
          if (match) {
            updated[taskId] = tabs.filter((t) => t.id !== match.id)
            break
          }
        }
        return updated
      })

      setTabPerTask((prev) => {
        const updated = { ...prev }
        for (const [taskId, tab] of Object.entries(updated)) {
          if (typeof tab === 'string' && tab.startsWith('shell:')) {
            const shellId = tab.slice('shell:'.length)
            if (exitedSessionId.endsWith(`:${shellId}`)) {
              updated[taskId] = 'claude'
              break
            }
          }
        }
        return updated
      })
    })
    return cleanup
  }, [])

  // Keep refs to avoid stale closures across async boundaries
  const taskIdRef = useRef(selectedTaskId)
  taskIdRef.current = selectedTaskId

  const handlePickDirectory = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId || activeSessions.has(currentTaskId)) return
    const dir = await window.api.openDirectory()
    if (dir) {
      const result = await window.api.validateRepo(dir)
      // Re-read taskId after awaits to avoid stale closure
      const freshTaskId = taskIdRef.current
      if (!freshTaskId) return
      if (result.valid) {
        setDirError(null)
        updateDirectory(freshTaskId, dir)
      } else {
        setDirError(result.error ?? 'Invalid directory')
      }
    }
  }, [activeSessions, updateDirectory])

  const handleStartSession = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId || isStarting) return
    const freshDir = useTaskStore.getState().getEffectiveDirectory(currentTaskId)
    if (!freshDir) return
    setIsStarting(true)
    try {
      const result = await window.api.ptySpawn(currentTaskId, freshDir, resolved)
      if (result.success) {
        startSession(currentTaskId)
      }
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, resolved, startSession])

  const handleStopSession = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId) return
    await window.api.ptyKill(currentTaskId)
    stopSession(currentTaskId)
  }, [stopSession])

  const handleAddShellTab = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId) return
    const freshDir = useTaskStore.getState().getEffectiveDirectory(currentTaskId)
    if (!freshDir) return
    shellCounterRef.current++
    const id = `shell-${shellCounterRef.current}`
    const sessionId = `${currentTaskId}:${id}`
    const currentShellTabs = shellTabsPerTask[currentTaskId] || []
    const num = currentShellTabs.length + 1
    const tab: ShellTab = { id, label: `Shell ${num}`, sessionId }

    setShellTabsPerTask((prev) => ({
      ...prev,
      [currentTaskId]: [...(prev[currentTaskId] || []), tab]
    }))
    setActiveTab(`shell:${id}`)

    await window.api.ptySpawnShell(sessionId, freshDir, resolved)
  }, [resolved, shellTabsPerTask, setActiveTab])

  const handleCloseShellTab = useCallback(
    async (shellTab: ShellTab): Promise<void> => {
      if (!selectedTaskId) return
      await window.api.ptyKill(shellTab.sessionId)

      setShellTabsPerTask((prev) => ({
        ...prev,
        [selectedTaskId]: (prev[selectedTaskId] || []).filter((t) => t.id !== shellTab.id)
      }))

      if (activeTab === `shell:${shellTab.id}`) {
        setActiveTab('claude')
      }
    },
    [selectedTaskId, activeTab, setActiveTab]
  )

  if (!selectedTaskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <div className="relative">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-muted/50 border border-border/50">
              <ListTodo className="size-7 text-muted-foreground/30" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex items-center justify-center size-7 rounded-lg bg-primary/10 border border-primary/20">
              <Terminal className="size-3.5 text-primary/50" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p
              className="text-sm font-medium text-muted-foreground/70"
              data-testid="no-task-selected"
            >
              Select a task to begin
            </p>
            <p className="text-xs text-muted-foreground/40">
              Choose a task from the sidebar to view details and start a session
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!task) return null

  const isDone = task.state === 'done'
  const isInherited = !task.directory && !!effectiveDir
  const sessionActive = activeSessions.has(task.id)

  return (
    <div className="flex flex-col h-full" data-testid="task-detail">
      <TaskHeader
        task={task}
        effectiveDir={effectiveDir}
        isInherited={isInherited}
        sessionActive={sessionActive}
        isDone={isDone}
        isStarting={isStarting}
        onPickDirectory={handlePickDirectory}
        onStartSession={handleStartSession}
        onStopSession={handleStopSession}
      />

      <Separator />

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        shellTabs={shellTabs}
        effectiveDir={effectiveDir}
        sessionActive={sessionActive}
        onAddShellTab={handleAddShellTab}
        onCloseShellTab={handleCloseShellTab}
      />

      {/* Content area */}
      {activeTab === 'review' && effectiveDir ? (
        <ReviewPanel
          directory={effectiveDir}
          taskId={task.id}
          sessionActive={sessionActive}
          mode={diffMode}
          onModeChange={setDiffMode}
          onSubmitted={() => setActiveTab('claude')}
        />
      ) : activeTab.startsWith('shell:') ? (
        (() => {
          const shellId = activeTab.slice('shell:'.length)
          const shellTab = shellTabs.find((t) => t.id === shellId)
          return shellTab ? (
            <TerminalPanel key={shellTab.sessionId} sessionId={shellTab.sessionId} />
          ) : null
        })()
      ) : sessionActive ? (
        <TerminalPanel sessionId={task.id} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 animate-fade-in-up-delay-2">
            <div className="flex items-center justify-center size-12 rounded-xl bg-muted/40 border border-border/40">
              <BotMessageSquare className="size-5 text-muted-foreground/25" />
            </div>
            <p className="text-sm text-muted-foreground/40" data-testid="no-active-session">
              No active session
            </p>
            {effectiveDir && (
              <p className="text-xs text-muted-foreground/30">
                Click Start Session to launch Claude Code
              </p>
            )}
          </div>
        </div>
      )}

      {/* Directory validation error dialog */}
      <Dialog open={!!dirError} onOpenChange={(open) => !open && setDirError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Invalid directory
            </DialogTitle>
            <DialogDescription data-testid="directory-error">{dirError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDirError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
