export interface NavigationEntry {
  taskId: string
  groupId: string
}

export interface NavigationState {
  backStack: NavigationEntry[]
  forwardStack: NavigationEntry[]
  mruList: NavigationEntry[]
}

const MAX_BACK_FORWARD = 100
const MAX_MRU = 10

function pushMru(mruList: NavigationEntry[], entry: NavigationEntry): NavigationEntry[] {
  const filtered = mruList.filter((e) => e.taskId !== entry.taskId)
  return [entry, ...filtered].slice(0, MAX_MRU)
}

export function pushNavigation(
  state: NavigationState,
  current: NavigationEntry | null,
  target: NavigationEntry
): NavigationState {
  if (current && current.taskId === target.taskId) return state

  const backStack = current
    ? [...state.backStack, current].slice(-MAX_BACK_FORWARD)
    : state.backStack

  return {
    backStack,
    forwardStack: [],
    mruList: pushMru(state.mruList, target)
  }
}

export function goBack(
  state: NavigationState,
  current: NavigationEntry,
  taskExists: (taskId: string) => boolean
): { state: NavigationState; target: NavigationEntry } | null {
  const backStack = [...state.backStack]
  let target: NavigationEntry | undefined

  while (backStack.length > 0) {
    const candidate = backStack.pop()!
    if (taskExists(candidate.taskId)) {
      target = candidate
      break
    }
  }

  if (!target) return null

  // Also purge any remaining deleted entries from the top of backStack
  while (backStack.length > 0 && !taskExists(backStack[backStack.length - 1].taskId)) {
    backStack.pop()
  }

  return {
    state: {
      backStack,
      forwardStack: [...state.forwardStack, current].slice(-MAX_BACK_FORWARD),
      mruList: pushMru(state.mruList, target)
    },
    target
  }
}

export function goForward(
  state: NavigationState,
  current: NavigationEntry,
  taskExists: (taskId: string) => boolean
): { state: NavigationState; target: NavigationEntry } | null {
  const forwardStack = [...state.forwardStack]
  let target: NavigationEntry | undefined

  while (forwardStack.length > 0) {
    const candidate = forwardStack.pop()!
    if (taskExists(candidate.taskId)) {
      target = candidate
      break
    }
  }

  if (!target) return null

  // Purge any remaining deleted entries from the top of forwardStack
  while (forwardStack.length > 0 && !taskExists(forwardStack[forwardStack.length - 1].taskId)) {
    forwardStack.pop()
  }

  return {
    state: {
      backStack: [...state.backStack, current].slice(-MAX_BACK_FORWARD),
      forwardStack,
      mruList: pushMru(state.mruList, target)
    },
    target
  }
}

export function getMruExcludingCurrent(
  mruList: NavigationEntry[],
  currentTaskId: string | null
): NavigationEntry[] {
  if (!currentTaskId) return mruList
  return mruList.filter((e) => e.taskId !== currentTaskId)
}
