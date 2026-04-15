import type { StateCreator } from 'zustand'
import type { FullStore } from '../task-store'
import {
  pushNavigation,
  goBack as goBackPure,
  goForward as goForwardPure,
  getMruExcludingCurrent,
  type NavigationEntry,
  type NavigationState
} from '../../lib/navigation'

export type { NavigationEntry }

export interface NavigationSlice {
  backStack: NavigationEntry[]
  forwardStack: NavigationEntry[]
  mruList: NavigationEntry[]

  navigateToTask: (taskId: string, groupId?: string) => void
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getMruList: () => NavigationEntry[]
}

function getNavState(get: () => FullStore): NavigationState {
  const { backStack, forwardStack, mruList } = get()
  return { backStack, forwardStack, mruList }
}

function getCurrentEntry(get: () => FullStore): NavigationEntry | null {
  const { selectedTaskId, activeGroupId } = get()
  if (!selectedTaskId) return null
  return { taskId: selectedTaskId, groupId: activeGroupId }
}

function applyNavigation(
  get: () => FullStore,
  set: (partial: Partial<FullStore>) => void,
  target: NavigationEntry,
  newState: NavigationState
): void {
  const { activeGroupId, setActiveGroup, selectTask } = get()
  set({
    backStack: newState.backStack,
    forwardStack: newState.forwardStack,
    mruList: newState.mruList
  })

  if (target.groupId !== activeGroupId) {
    setActiveGroup(target.groupId)
    requestAnimationFrame(() => selectTask(target.taskId))
  } else {
    selectTask(target.taskId)
  }
}

export const createNavigationSlice: StateCreator<FullStore, [], [], NavigationSlice> = (
  set,
  get
) => ({
  backStack: [],
  forwardStack: [],
  mruList: [],

  navigateToTask: (taskId, groupId) => {
    const effectiveGroupId = groupId ?? get().activeGroupId
    const current = getCurrentEntry(get)
    const target: NavigationEntry = { taskId, groupId: effectiveGroupId }
    const currentState = getNavState(get)
    const newState = pushNavigation(currentState, current, target)
    if (newState === currentState) return // no-op (same task)
    applyNavigation(get, set, target, newState)
  },

  goBack: () => {
    const current = getCurrentEntry(get)
    if (!current) return
    const taskExists = (id: string): boolean => get().getTask(id) !== undefined
    const result = goBackPure(getNavState(get), current, taskExists)
    if (!result) return
    applyNavigation(get, set, result.target, result.state)
  },

  goForward: () => {
    const current = getCurrentEntry(get)
    if (!current) return
    const taskExists = (id: string): boolean => get().getTask(id) !== undefined
    const result = goForwardPure(getNavState(get), current, taskExists)
    if (!result) return
    applyNavigation(get, set, result.target, result.state)
  },

  canGoBack: () => get().backStack.length > 0,

  canGoForward: () => get().forwardStack.length > 0,

  getMruList: () => getMruExcludingCurrent(get().mruList, get().selectedTaskId)
})
