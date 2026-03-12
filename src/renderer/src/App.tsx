import { useEffect } from 'react'
import { TaskList } from './components/TaskList'
import { TaskDetail } from './components/TaskDetail'
import { useTaskStore } from './store/task-store'
import { TooltipProvider } from '@/components/ui/tooltip'

function App(): React.JSX.Element {
  const { loadTasks, loaded } = useTaskStore()

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

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
        <aside className="w-80 flex-shrink-0 h-full bg-sidebar-bg border-r border-sidebar-border">
          <TaskList />
        </aside>
        <main className="flex-1 h-full">
          <TaskDetail />
        </main>
      </div>
    </TooltipProvider>
  )
}

export default App
