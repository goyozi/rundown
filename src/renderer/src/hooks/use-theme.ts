import { useEffect, useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'rundown-theme'

let mode: ThemeMode = (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system'
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((l) => l())
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(m: ThemeMode): ResolvedTheme {
  return m === 'system' ? getSystemTheme() : m
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

function syncNativeTheme(m: ThemeMode): void {
  window.api?.setNativeTheme?.(m)
}

// Apply immediately on load
apply(resolve(mode))
syncNativeTheme(mode)

// React to OS theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (mode === 'system') {
    apply(resolve(mode))
    notify()
  }
})

function setTheme(next: ThemeMode): void {
  mode = next
  localStorage.setItem(STORAGE_KEY, next)
  apply(resolve(next))
  syncNativeTheme(next)
  notify()
}

function cycle(): void {
  const order: ThemeMode[] = ['light', 'dark', 'system']
  const idx = order.indexOf(mode)
  setTheme(order[(idx + 1) % order.length])
}

export function useTheme(): {
  mode: ThemeMode
  resolved: ResolvedTheme
  setTheme: (next: ThemeMode) => void
  cycle: () => void
} {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => mode
  )

  const resolved = resolve(current)

  useEffect(() => {
    apply(resolved)
  }, [resolved])

  return { mode: current, resolved, setTheme, cycle }
}
