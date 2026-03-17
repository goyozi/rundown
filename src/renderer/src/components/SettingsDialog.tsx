import { Sun, Moon, Monitor, FolderOpen } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { useTaskStore } from '@/store/task-store'
import { useShallow } from 'zustand/react/shallow'

const themeLabel = { light: 'Light', dark: 'Dark', system: 'System' } as const

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { mode, setTheme } = useTheme()
  const { settings, updateSettings, setSessionResume } = useTaskStore(
    useShallow((s) => ({
      settings: s.settings,
      updateSettings: s.updateSettings,
      setSessionResume: s.setSessionResume
    }))
  )

  const handleThemeChange = (t: 'light' | 'dark' | 'system'): void => {
    setTheme(t)
    updateSettings({ theme: t })
  }

  const isValidWorktreeDir = (dir: string): boolean => {
    const trimmed = dir.trim()
    return trimmed === '' || trimmed.startsWith('/') || trimmed.startsWith('~/')
  }

  const handlePickWorktreeDir = async (): Promise<void> => {
    const dir = await window.api.openDirectory()
    if (dir) {
      updateSettings({ worktreeBaseDir: dir })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Theme selector */}
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
                    onClick={() => handleThemeChange(t)}
                    data-testid={`theme-option-${t}`}
                  >
                    <ThemeIcon className="size-3.5" />
                    {themeLabel[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Worktree toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="worktrees-toggle" className="text-sm font-medium">
                  Automatic worktrees
                </label>
                <p className="text-xs text-muted-foreground">
                  Create isolated git worktrees per task for parallel work
                </p>
              </div>
              <Switch
                id="worktrees-toggle"
                checked={settings.worktreesEnabled}
                onCheckedChange={(checked) => {
                  if (checked && !isValidWorktreeDir(settings.worktreeBaseDir)) return
                  updateSettings({ worktreesEnabled: checked })
                }}
                data-testid="worktrees-toggle"
              />
            </div>

            {/* Worktree directory */}
            <div
              className={`space-y-1.5 ${!settings.worktreesEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <label className="text-xs text-muted-foreground">Worktree directory</label>
              <div className="flex items-center gap-2">
                <Input
                  value={settings.worktreeBaseDir}
                  onChange={(e) => {
                    const next = e.target.value
                    if (isValidWorktreeDir(next)) {
                      updateSettings({ worktreeBaseDir: next })
                    } else {
                      // Still update the input value for UX, but disable worktrees
                      updateSettings({ worktreeBaseDir: next, worktreesEnabled: false })
                    }
                  }}
                  className={`h-8 text-xs font-mono ${
                    !isValidWorktreeDir(settings.worktreeBaseDir) ? 'border-destructive' : ''
                  }`}
                  placeholder="~/rundown/worktrees/"
                  data-testid="worktree-dir-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={handlePickWorktreeDir}
                  data-testid="worktree-dir-picker"
                >
                  <FolderOpen className="size-3.5" />
                </Button>
              </div>
              {settings.worktreeBaseDir.trim() !== '' &&
                !settings.worktreeBaseDir.startsWith('/') &&
                !settings.worktreeBaseDir.startsWith('~/') && (
                  <p className="text-[11px] text-destructive">Path must start with / or ~/</p>
                )}
            </div>
          </div>

          {/* Session Resume toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="session-resume-toggle" className="text-sm font-medium">
                  Session Resume
                </label>
                <p className="text-xs text-muted-foreground">
                  Resume previous Claude Code sessions when returning to a task
                </p>
              </div>
              <Switch
                id="session-resume-toggle"
                checked={settings.sessionResume}
                onCheckedChange={(checked) => setSessionResume(checked)}
                data-testid="session-resume-toggle"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              Enabling this feature will modify your Claude Code configuration (
              <code className="font-mono">~/.claude/settings.json</code>) to register a Rundown
              session hook. Disabling it will remove the hook.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
