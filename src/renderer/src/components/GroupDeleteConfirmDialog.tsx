import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface GroupDeleteConfirmDialogProps {
  group: { id: string; name: string } | null
  taskCount: number
  hasSessions: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function GroupDeleteConfirmDialog({
  group,
  taskCount,
  hasSessions,
  onConfirm,
  onCancel
}: GroupDeleteConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete group &ldquo;{group?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            {hasSessions && <>Active sessions in this group will be stopped. </>}
            {taskCount > 0 ? (
              <>
                This will permanently delete {taskCount} {taskCount === 1 ? 'task' : 'tasks'} and
                all sub-tasks.
              </>
            ) : (
              <>This group is empty and will be removed.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} data-testid="confirm-delete-group">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
