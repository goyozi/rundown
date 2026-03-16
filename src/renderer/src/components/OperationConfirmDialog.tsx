import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'

export function OperationConfirmDialog(): React.ReactElement | null {
  const {
    pendingOperation,
    confirmOperation,
    cancelOperation,
    getTask,
    getChildren,
    activeSessions
  } = useTaskStore(
    useShallow((s) => ({
      pendingOperation: s.pendingOperation,
      confirmOperation: s.confirmOperation,
      cancelOperation: s.cancelOperation,
      getTask: s.getTask,
      getChildren: s.getChildren,
      activeSessions: s.activeSessions
    }))
  )

  if (!pendingOperation) return null

  const task = getTask(pendingOperation.taskId)
  if (!task) return null

  const hasChildren = getChildren(task.id).length > 0
  const sessionActive = activeSessions.has(task.id)

  if (pendingOperation.type === 'delete') {
    return (
      <Dialog open onOpenChange={(open) => !open && cancelOperation()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              {hasChildren
                ? `This will delete "${task.description}" and all its sub-tasks.`
                : `This will delete "${task.description}".`}
              {sessionActive && ' The active session will be stopped.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelOperation} data-testid="cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmOperation()}
              data-testid="confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // markDone with active session
  return (
    <Dialog open onOpenChange={(open) => !open && cancelOperation()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop session and mark as done?</DialogTitle>
          <DialogDescription>
            A session is still active. Stop the session and mark as done?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancelOperation} data-testid="cancel-done">
            Cancel
          </Button>
          <Button onClick={() => confirmOperation()} data-testid="confirm-done">
            Yes, mark as done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
