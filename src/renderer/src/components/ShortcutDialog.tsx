import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { IconPicker } from './IconPicker'
import type { Shortcut } from '../../../shared/types'

interface ShortcutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: { name: string; icon: string; type: 'shell' | 'claude'; command: string }) => void
  initial?: Shortcut
}

function ShortcutForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: Shortcut
  onSave: ShortcutDialogProps['onSave']
  onCancel: () => void
}): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<'shell' | 'claude'>(initial?.type ?? 'shell')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? 'terminal')

  const canSave = name.trim() !== '' && command.trim() !== ''

  const handleSave = (): void => {
    if (!canSave) return
    onSave({ name: name.trim(), icon, type, command: command.trim() })
  }

  return (
    <div className="space-y-5 py-2">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Git Pull"
          className="h-8 text-sm"
          data-testid="shortcut-name-input"
        />
      </div>

      {/* Type toggle */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Type</label>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(['shell', 'claude'] as const).map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`shortcut-type-${t}`}
              className={`flex-1 px-2 h-7 rounded-sm text-xs transition-colors ${
                type === t
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
              onClick={() => setType(t)}
            >
              {t === 'shell' ? 'Shell command' : 'Claude prompt'}
            </button>
          ))}
        </div>
      </div>

      {/* Command */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Command</label>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={
            type === 'shell' ? 'e.g. git pull' : 'e.g. create a PR for the current branch'
          }
          className="h-8 text-xs font-mono"
          data-testid="shortcut-command-input"
        />
      </div>

      {/* Icon */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Icon</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={handleSave}
          data-testid="shortcut-save-button"
        >
          {initial ? 'Save' : 'Add Shortcut'}
        </Button>
      </div>
    </div>
  )
}

export function ShortcutDialog({
  open,
  onOpenChange,
  onSave,
  initial
}: ShortcutDialogProps): React.JSX.Element {
  const handleSave = (data: Parameters<ShortcutDialogProps['onSave']>[0]): void => {
    onSave(data)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Shortcut' : 'Add Shortcut'}</DialogTitle>
        </DialogHeader>
        {open && (
          <ShortcutForm
            key={initial?.id ?? 'new'}
            initial={initial}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
