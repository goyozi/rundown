import { Sun, Moon, Monitor } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/hooks/use-theme'

const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' } as const

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { mode, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Theme</span>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              {(['light', 'dark', 'system'] as const).map((t) => {
                const icons = { light: Sun, dark: Moon, system: Monitor }
                const ThemeIcon = icons[t]
                return (
                  <button
                    key={t}
                    className={`flex items-center gap-1.5 px-2 h-7 rounded-sm text-xs transition-colors ${
                      mode === t
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                    onClick={() => setTheme(t)}
                    data-testid={`theme-option-${t}`}
                  >
                    <ThemeIcon className="size-3.5" />
                    {themeLabel[t]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
