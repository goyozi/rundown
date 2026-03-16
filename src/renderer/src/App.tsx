import { useEffect, useState, useCallback, useRef } from 'react'
import { TaskList } from './components/TaskList'
import { TaskDetail } from './components/TaskDetail'
import { useTaskStore } from './store/task-store'
import { useCommentStore } from './store/comment-store'
import { useShallow } from 'zustand/react/shallow'
import { TooltipProvider } from '@/components/ui/tooltip'

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 520
const DEFAULT_SIDEBAR = 320

function App(): React.JSX.Element {
  const { loadTasks, loaded, stopSession } = useTaskStore(
    useShallow((s) => ({
      loadTasks: s.loadTasks,
      loaded: s.loaded,
      stopSession: s.stopSession
    }))
  )
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR)
  const isDragging = useRef(false)

  const loadComments = useCommentStore((s) => s.loadComments)

  useEffect(() => {
    loadTasks()
    loadComments()
    window.api.getSidebarWidth().then((w) => setSidebarWidth(w))
  }, [loadTasks, loadComments])

  // Listen for PTY process exits to clean up session state
  useEffect(() => {
    const cleanup = window.api.onPtyExit((taskId) => {
      stopSession(taskId)
    })
    return cleanup
  }, [stopSession])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (ev: MouseEvent): void => {
      if (!isDragging.current) return
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, ev.clientX))
      setSidebarWidth(newWidth)
    }

    const onMouseUp = (ev: MouseEvent): void => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      const finalWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, ev.clientX))
      window.api.saveSidebarWidth(finalWidth)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  if (!loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen bg-background">
        <aside
          className="flex-shrink-0 h-full bg-sidebar-bg border-r border-sidebar-border relative"
          style={{ width: sidebarWidth }}
        >
          <TaskList />
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
            onMouseDown={handleMouseDown}
            data-testid="sidebar-resize-handle"
          />
        </aside>
        <main className="flex-1 h-full min-w-0">
          <TaskDetail />
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
