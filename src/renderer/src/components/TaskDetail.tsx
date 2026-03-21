import React, { useState, useCallback, useRef } from 'react'
import { ListTodo, Terminal, AlertCircle, AlertTriangle, BotMessageSquare } from 'lucide-react'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'
import { useTheme } from '@/hooks/use-theme'
import { useDirectoryPicker } from '@/hooks/use-directory-picker'
import { useWorktreeSession } from '@/hooks/use-worktree-session'
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
import type { ShellTab } from '@/store/slices/shell-tab-slice'
import type { DiffMode, WorktreeMode } from '../../../shared/types'

// Module-level counter so shell IDs never collide across remounts
let shellIdCounter = 0

export function TaskDetail(): React.JSX.Element | null {
  const {
    selectedTaskId,
    task,
    effectiveDir,
    updateDirectory,
    activeSessions,
    startSession,
    stopSession,
    tabPerTask,
    storeSetActiveTab,
    shellTabsPerTask,
    addShellTab,
    removeShellTab,
    effectiveWorktree,
    resolvedMode,
    inheritedWorktree,
    setWorktreeMode,
    lockTask,
    deleteWorktreeOnTask,
    clearNoWorktreeLock
  } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      task: s.selectedTaskId ? s.getTask(s.selectedTaskId) : undefined,
      effectiveDir: s.selectedTaskId ? s.getEffectiveDirectory(s.selectedTaskId) : undefined,
      updateDirectory: s.updateDirectory,
      activeSessions: s.activeSessions,
      startSession: s.startSession,
      stopSession: s.stopSession,
      tabPerTask: s.tabPerTask,
      storeSetActiveTab: s.setActiveTab,
      shellTabsPerTask: s.shellTabsPerTask,
      addShellTab: s.addShellTab,
      removeShellTab: s.removeShellTab,
      effectiveWorktree: s.selectedTaskId ? s.getEffectiveWorktree(s.selectedTaskId) : undefined,
      resolvedMode: s.selectedTaskId ? s.resolveEffectiveMode(s.selectedTaskId) : undefined,
      inheritedWorktree: s.selectedTaskId ? s.getInheritedWorktree(s.selectedTaskId) : undefined,
      setWorktreeMode: s.setWorktreeMode,
      lockTask: s.lockTask,
      deleteWorktreeOnTask: s.deleteWorktreeOnTask,
      clearNoWorktreeLock: s.clearNoWorktreeLock
    }))
  )
  const { resolved } = useTheme()
  const { resolveSessionCwd, createWorktreeNow, worktreeWarning, clearWorktreeWarning } =
    useWorktreeSession()
  const [isStarting, setIsStarting] = useState(false)
  const [spawnError, setSpawnError] = useState<string | null>(null)
  const [modePerTask, setModePerTask] = useState<Record<string, DiffMode>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clearLockConfirmOpen, setClearLockConfirmOpen] = useState(false)

  const activeTab = (selectedTaskId && tabPerTask[selectedTaskId]) || 'claude'
  const shellTabs = (selectedTaskId && shellTabsPerTask[selectedTaskId]) || []
  const setActiveTab = useCallback(
    (tab: Parameters<typeof storeSetActiveTab>[1]): void => {
      if (selectedTaskId) storeSetActiveTab(selectedTaskId, tab)
    },
    [selectedTaskId, storeSetActiveTab]
  )

  const diffMode: DiffMode = (selectedTaskId && modePerTask[selectedTaskId]) || 'uncommitted'
  const setDiffMode = useCallback(
    (mode: DiffMode): void => {
      if (selectedTaskId) {
        setModePerTask((prev) => ({ ...prev, [selectedTaskId]: mode }))
      }
    },
    [selectedTaskId]
  )

  // Keep refs to avoid stale closures across async boundaries
  const taskIdRef = useRef(selectedTaskId)
  taskIdRef.current = selectedTaskId

  const {
    pickDirectory: handlePickDirectory,
    dirError,
    clearDirError
  } = useDirectoryPicker({
    onValid: (dir) => {
      const freshTaskId = taskIdRef.current
      if (freshTaskId) updateDirectory(freshTaskId, dir)
    },
    canPick: () => {
      const currentTaskId = taskIdRef.current
      return !!currentTaskId && !activeSessions.has(currentTaskId)
    }
  })

  const handleModeChange = useCallback(
    (mode: WorktreeMode): void => {
      const currentTaskId = taskIdRef.current
      if (currentTaskId) setWorktreeMode(currentTaskId, mode)
    },
    [setWorktreeMode]
  )

  const handleCreateWorktree = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (currentTaskId) await createWorktreeNow(currentTaskId)
  }, [createWorktreeNow])

  const handleDeleteWorktree = useCallback((): void => {
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    setDeleteConfirmOpen(false)
    if (currentTaskId) await deleteWorktreeOnTask(currentTaskId)
  }, [deleteWorktreeOnTask])

  const handleClearNoWorktreeLock = useCallback((): void => {
    setClearLockConfirmOpen(true)
  }, [])

  const handleLockNoWorktree = useCallback((): void => {
    const currentTaskId = taskIdRef.current
    if (currentTaskId) lockTask(currentTaskId)
  }, [lockTask])

  const handleConfirmClearLock = useCallback((): void => {
    const currentTaskId = taskIdRef.current
    setClearLockConfirmOpen(false)
    if (currentTaskId) clearNoWorktreeLock(currentTaskId)
  }, [clearNoWorktreeLock])

  const handleStartSession = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId || isStarting) return
    const freshDir = useTaskStore.getState().getEffectiveDirectory(currentTaskId)
    if (!freshDir) return
    setIsStarting(true)
    setSpawnError(null)
    try {
      const cwd = (await resolveSessionCwd(currentTaskId)) ?? freshDir
      const result = await window.api.ptySpawn(currentTaskId, cwd, resolved)
      if (result.success) {
        startSession(currentTaskId)
      } else {
        setSpawnError(result.error ?? 'Failed to start session')
      }
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, resolved, startSession, resolveSessionCwd])

  const handleStopSession = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId) return
    try {
      await window.api.ptyKill(currentTaskId)
    } catch {
      // Process may have already exited — proceed with cleanup
    }
    stopSession(currentTaskId)
  }, [stopSession])

  const handleAddShellTab = useCallback(async (): Promise<void> => {
    const currentTaskId = taskIdRef.current
    if (!currentTaskId) return
    const freshDir = useTaskStore.getState().getEffectiveDirectory(currentTaskId)
    if (!freshDir) return
    shellIdCounter++
    const id = `shell-${shellIdCounter}`
    const sessionId = `${currentTaskId}:${id}`
    const currentShellTabs = useTaskStore.getState().getShellTabs(currentTaskId)
    const num = currentShellTabs.length + 1
    const tab: ShellTab = { id, label: `Shell ${num}`, sessionId }

    try {
      const cwd = (await resolveSessionCwd(currentTaskId)) ?? freshDir
      const result = await window.api.ptySpawnShell(sessionId, cwd, resolved)
      if (result.success) {
        addShellTab(currentTaskId, tab)
        storeSetActiveTab(currentTaskId, `shell:${id}`)
      } else {
        setSpawnError(result.error ?? 'Failed to open shell')
      }
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : 'Failed to open shell')
    }
  }, [resolved, addShellTab, storeSetActiveTab, resolveSessionCwd])

  const handleCloseShellTab = useCallback(
    async (shellTab: ShellTab): Promise<void> => {
      if (!selectedTaskId) return
      try {
        await window.api.ptyKill(shellTab.sessionId)
      } catch {
        // Process may have already exited — proceed with cleanup
      }

      removeShellTab(selectedTaskId, shellTab.id)

      if (activeTab === `shell:${shellTab.id}`) {
        storeSetActiveTab(selectedTaskId, 'claude')
      }
    },
    [selectedTaskId, activeTab, storeSetActiveTab, removeShellTab]
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
  // Single source of truth for the worktree-aware working directory
  const workingDir = effectiveWorktree ? effectiveWorktree.path : effectiveDir

  // Determine if this task owns its effective worktree
  const isWorktreeOwner = effectiveWorktree
    ? !!task.worktree && task.worktree.worktreeId === effectiveWorktree.worktreeId
    : false

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
        worktreeMode={task.worktreeMode}
        resolvedMode={resolvedMode}
        isLocked={task.worktreeLocked}
        effectiveWorktreeName={effectiveWorktree?.name}
        isWorktreeOwner={isWorktreeOwner}
        inheritedWorktreeName={inheritedWorktree?.name}
        onModeChange={handleModeChange}
        onCreateWorktree={handleCreateWorktree}
        onDeleteWorktree={handleDeleteWorktree}
        onClearNoWorktreeLock={handleClearNoWorktreeLock}
        onLockNoWorktree={handleLockNoWorktree}
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

      {/* Content area — terminals are always mounted (but hidden) to preserve scrollback */}
      {activeTab === 'review' && workingDir && (
        <ReviewPanel
          directory={workingDir}
          taskId={task.id}
          sessionActive={sessionActive}
          mode={diffMode}
          onModeChange={setDiffMode}
          onSubmitted={() => setActiveTab('claude')}
        />
      )}

      {sessionActive && <TerminalPanel sessionId={task.id} visible={activeTab === 'claude'} />}

      {shellTabs.map((st) => (
        <TerminalPanel
          key={st.sessionId}
          sessionId={st.sessionId}
          visible={activeTab === `shell:${st.id}`}
        />
      ))}

      {activeTab === 'claude' && !sessionActive && (
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
      <Dialog open={!!dirError} onOpenChange={(open) => !open && clearDirError()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Invalid directory
            </DialogTitle>
            <DialogDescription data-testid="directory-error">{dirError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={clearDirError}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session spawn error dialog */}
      <Dialog open={!!spawnError} onOpenChange={(open) => !open && setSpawnError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-destructive" />
              Failed to start session
            </DialogTitle>
            <DialogDescription data-testid="spawn-error">{spawnError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSpawnError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Worktree warning dialog */}
      <Dialog open={!!worktreeWarning} onOpenChange={(open) => !open && clearWorktreeWarning()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Worktree issue
            </DialogTitle>
            <DialogDescription data-testid="worktree-warning">{worktreeWarning}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={clearWorktreeWarning}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear no-worktree lock confirmation dialog */}
      <Dialog open={clearLockConfirmOpen} onOpenChange={setClearLockConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Clear worktree lock
            </DialogTitle>
            <DialogDescription>
              Changes made in the repository directory will not be reverted. The current Claude Code
              session will not be resumed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearLockConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmClearLock}
              data-testid="confirm-clear-lock"
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete worktree confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" />
              Delete worktree
            </DialogTitle>
            <DialogDescription>
              This will remove the worktree directory and its branch from disk. Any inheriting child
              tasks will be reset. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              data-testid="confirm-delete-worktree"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
