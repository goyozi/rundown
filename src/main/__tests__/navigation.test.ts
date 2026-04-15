import { describe, it, expect } from 'vitest'
import {
  pushNavigation,
  goBack,
  goForward,
  getMruExcludingCurrent,
  type NavigationEntry,
  type NavigationState
} from '../../renderer/src/lib/navigation'

function entry(taskId: string, groupId = 'g1'): NavigationEntry {
  return { taskId, groupId }
}

function emptyState(): NavigationState {
  return { backStack: [], forwardStack: [], mruList: [] }
}

describe('pushNavigation', () => {
  it('pushes current onto backStack and clears forwardStack', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [entry('x')],
      mruList: []
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.backStack).toEqual([entry('a')])
    expect(result.forwardStack).toEqual([])
  })

  it('adds target to front of mruList', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: [entry('a')]
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.mruList[0]).toEqual(entry('b'))
  })

  it('deduplicates target in mruList', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: [entry('a'), entry('b'), entry('c')]
    }
    const result = pushNavigation(state, entry('a'), entry('b'))
    expect(result.mruList.map((e) => e.taskId)).toEqual(['b', 'a', 'c'])
  })

  it('returns unchanged state when navigating to same task', () => {
    const state: NavigationState = {
      backStack: [entry('x')],
      forwardStack: [entry('y')],
      mruList: [entry('a')]
    }
    const result = pushNavigation(state, entry('a'), entry('a'))
    expect(result).toBe(state)
  })

  it('skips backStack push when current is null', () => {
    const state = emptyState()
    const result = pushNavigation(state, null, entry('a'))
    expect(result.backStack).toEqual([])
    expect(result.mruList).toEqual([entry('a')])
  })

  it('caps backStack at 100 entries', () => {
    const state: NavigationState = {
      backStack: Array.from({ length: 100 }, (_, i) => entry(`t${i}`)),
      forwardStack: [],
      mruList: []
    }
    const result = pushNavigation(state, entry('current'), entry('new'))
    expect(result.backStack).toHaveLength(100)
    expect(result.backStack[0]).toEqual(entry('t1'))
    expect(result.backStack[99]).toEqual(entry('current'))
  })

  it('caps mruList at 10 entries', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [],
      mruList: Array.from({ length: 10 }, (_, i) => entry(`t${i}`))
    }
    const result = pushNavigation(state, entry('current'), entry('new'))
    expect(result.mruList).toHaveLength(10)
    expect(result.mruList[0]).toEqual(entry('new'))
  })
})

describe('goBack', () => {
  const exists = (): boolean => true

  it('pops from backStack and pushes current onto forwardStack', () => {
    const state: NavigationState = {
      backStack: [entry('a'), entry('b')],
      forwardStack: [],
      mruList: []
    }
    const result = goBack(state, entry('c'), exists)
    expect(result).not.toBeNull()
    expect(result!.target).toEqual(entry('b'))
    expect(result!.state.backStack).toEqual([entry('a')])
    expect(result!.state.forwardStack).toEqual([entry('c')])
  })

  it('returns null when backStack is empty', () => {
    const result = goBack(emptyState(), entry('a'), exists)
    expect(result).toBeNull()
  })

  it('skips deleted tasks', () => {
    const state: NavigationState = {
      backStack: [entry('a'), entry('deleted'), entry('b')],
      forwardStack: [],
      mruList: []
    }
    const existsFn = (id: string): boolean => id !== 'deleted'
    const result = goBack(state, entry('c'), existsFn)
    expect(result!.target).toEqual(entry('b'))
    expect(result!.state.backStack).toEqual([entry('a')])
  })

  it('returns null when all back entries are deleted', () => {
    const state: NavigationState = {
      backStack: [entry('x'), entry('y')],
      forwardStack: [],
      mruList: []
    }
    const result = goBack(state, entry('c'), () => false)
    expect(result).toBeNull()
  })

  it('updates mruList with target', () => {
    const state: NavigationState = {
      backStack: [entry('a')],
      forwardStack: [],
      mruList: [entry('c'), entry('b')]
    }
    const result = goBack(state, entry('c'), exists)
    expect(result!.state.mruList[0]).toEqual(entry('a'))
  })
})

describe('goForward', () => {
  const exists = (): boolean => true

  it('pops from forwardStack and pushes current onto backStack', () => {
    const state: NavigationState = {
      backStack: [entry('a')],
      forwardStack: [entry('c'), entry('d')],
      mruList: []
    }
    const result = goForward(state, entry('b'), exists)
    expect(result!.target).toEqual(entry('d'))
    expect(result!.state.backStack).toEqual([entry('a'), entry('b')])
    expect(result!.state.forwardStack).toEqual([entry('c')])
  })

  it('returns null when forwardStack is empty', () => {
    const result = goForward(emptyState(), entry('a'), exists)
    expect(result).toBeNull()
  })

  it('skips deleted tasks', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [entry('a'), entry('deleted')],
      mruList: []
    }
    const existsFn = (id: string): boolean => id !== 'deleted'
    const result = goForward(state, entry('b'), existsFn)
    expect(result!.target).toEqual(entry('a'))
  })

  it('purges deleted entries from top of remaining forwardStack', () => {
    const state: NavigationState = {
      backStack: [],
      forwardStack: [entry('a'), entry('deleted1'), entry('deleted2'), entry('c')],
      mruList: []
    }
    const existsFn = (id: string): boolean => !id.startsWith('deleted')
    const result = goForward(state, entry('b'), existsFn)
    expect(result!.target).toEqual(entry('c'))
    // deleted1 and deleted2 should be purged from top of remaining stack
    expect(result!.state.forwardStack).toEqual([entry('a')])
  })
})

describe('getMruExcludingCurrent', () => {
  it('excludes the current task', () => {
    const mru = [entry('a'), entry('b'), entry('c')]
    const result = getMruExcludingCurrent(mru, 'a')
    expect(result.map((e) => e.taskId)).toEqual(['b', 'c'])
  })

  it('returns full list when currentTaskId is null', () => {
    const mru = [entry('a'), entry('b')]
    const result = getMruExcludingCurrent(mru, null)
    expect(result).toEqual(mru)
  })

  it('returns empty array when mru is empty', () => {
    expect(getMruExcludingCurrent([], 'a')).toEqual([])
  })
})
