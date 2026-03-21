import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask, addSubtask, deleteTask } from './helpers/tasks'
import { startSession, stopSession, createTaskWithDir } from './helpers/sessions'
import {
  setDefaultWorktreeMode,
  selectTaskWorktreeMode,
  clickCreateWorktree,
  clickDeleteWorktree,
  clickClearNoWorktreeLock,
  clickLockNoWorktree,
  isWorktreeLocked,
  getResolvedModeHint,
  getWorktreeName,
  isWorktreeInherited,
  assertWorktreeExists,
  assertWorktreeNotExists,
  createWorktreeBaseDir,
  getWorktreeDirs,
  getTerminalCwd,
  normalizePath,
  waitForWorktreeCleanup,
  waitForBranchCleanup
} from './helpers/worktrees'

let app: ElectronApplication
let page: Page
let tempDirs: string[] = []

test.afterEach(async () => {
  if (app) await app.close()
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

// ---------------------------------------------------------------------------
// Worktree creation
// ---------------------------------------------------------------------------
test.describe('worktree creation', () => {
  test('creates worktree on CC session start', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'WT task', tempDirs)

    await startSession(page)

    // UI: worktree name visible
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()

    // Task should be locked after session start
    expect(await isWorktreeLocked(page)).toBe(true)

    // Git: worktree exists
    assertWorktreeExists(repoDir, name!)

    // Filesystem: one dir in base
    expect(getWorktreeDirs(wtBase).length).toBe(1)

    // Terminal CWD is under worktree base dir
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)
  })

  test('creates worktree on shell tab', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'Shell WT', tempDirs)

    // Open a shell tab instead of CC session
    await page.getByTestId('add-shell-tab').click()
    await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 10000 })

    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    assertWorktreeExists(repoDir, name!)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('skips worktree when default mode is no-worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'no-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'No WT', tempDirs)

    await startSession(page)

    // No worktree name visible
    const name = await getWorktreeName(page)
    expect(name).toBeNull()
    expect(getWorktreeDirs(wtBase).length).toBe(0)

    // Task should be locked after session start
    expect(await isWorktreeLocked(page)).toBe(true)

    // Terminal CWD is the repo dir itself
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd).toBe(normalizePath(repoDir))
  })

  test('uses custom base dir', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'Custom dir', tempDirs)

    await startSession(page)

    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('no repo — start disabled', async () => {
    ;({ app, page } = await launchApp())
    await createTask(page, 'No repo task')
    await clickTask(page, 'No repo task')

    // Start button should be disabled (no directory)
    await expect(page.getByTestId('start-session')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Worktree inheritance
// ---------------------------------------------------------------------------
test.describe('worktree inheritance', () => {
  test('child inherits parent worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'InheritParent', tempDirs)

    // Start session on parent to create worktree
    await startSession(page)
    const parentWtName = await getWorktreeName(page)
    expect(parentWtName).toBeTruthy()
    await stopSession(page)

    // Add subtask
    await addSubtask(page, 'InheritParent', 'InheritChild')
    await clickTask(page, 'InheritChild')

    // Child should show parent's worktree name
    const childWtName = await getWorktreeName(page)
    expect(childWtName).toBe(parentWtName)

    // Should show "inherited" label
    expect(await isWorktreeInherited(page)).toBe(true)

    // Start session on child — verify CWD
    await startSession(page)
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)

    // Still only one worktree dir
    expect(getWorktreeDirs(wtBase).length).toBe(1)
    assertWorktreeExists(repoDir, parentWtName!)
  })

  test('child-first launch — child gets own worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'FirstParent', tempDirs)

    // Add subtask without starting parent session
    await addSubtask(page, 'FirstParent', 'FirstChild')
    await clickTask(page, 'FirstChild')

    // Start session on child — in v2, child gets its own worktree (parent has intent only)
    await startSession(page)
    const childWtName = await getWorktreeName(page)
    expect(childWtName).toBeTruthy()
    // Child owns this worktree (not inherited)
    expect(await isWorktreeInherited(page)).toBe(false)

    // Go back to parent — should have no worktree yet
    await clickTask(page, 'FirstParent')
    const parentWtName = await getWorktreeName(page)
    expect(parentWtName).toBeNull()

    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('opt-out gives child own worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ParentOpt', tempDirs)

    // Start session on parent
    await startSession(page)
    const parentWtName = await getWorktreeName(page)
    expect(parentWtName).toBeTruthy()
    await stopSession(page)

    // Add subtask
    await addSubtask(page, 'ParentOpt', 'ChildOpt')
    await clickTask(page, 'ChildOpt')

    // Select own-worktree mode
    await selectTaskWorktreeMode(page, 'own-worktree')

    // Start session on child — gets its own worktree
    await startSession(page)
    const childWtName = await getWorktreeName(page)
    expect(childWtName).toBeTruthy()
    expect(childWtName).not.toBe(parentWtName)

    // Should NOT show inherited label
    expect(await isWorktreeInherited(page)).toBe(false)

    // Two worktree dirs
    expect(getWorktreeDirs(wtBase).length).toBe(2)

    // CWD is under wtBase but different from parent's
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)
  })

  test('chain break — grandchild inherits from opted-out child', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ChainRoot', tempDirs)

    // Start session on ChainRoot
    await startSession(page)
    const wtA = await getWorktreeName(page)
    expect(wtA).toBeTruthy()
    await stopSession(page)

    // ChainRoot → ChainMiddle (opts out)
    await addSubtask(page, 'ChainRoot', 'ChainMiddle')
    await clickTask(page, 'ChainMiddle')
    await selectTaskWorktreeMode(page, 'own-worktree')

    // Start session on ChainMiddle
    await startSession(page)
    const wtB = await getWorktreeName(page)
    expect(wtB).toBeTruthy()
    expect(wtB).not.toBe(wtA)
    await stopSession(page)

    // ChainMiddle → ChainLeaf (inherits from ChainMiddle)
    await addSubtask(page, 'ChainMiddle', 'ChainLeaf')
    await clickTask(page, 'ChainLeaf')

    const wtC = await getWorktreeName(page)
    expect(wtC).toBe(wtB) // ChainLeaf inherits ChainMiddle's worktree, not ChainRoot's
    expect(await isWorktreeInherited(page)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Session resume
// ---------------------------------------------------------------------------
test.describe('session resume', () => {
  test('reuses worktree on session restart', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'Resume task', tempDirs)

    // First session
    await startSession(page)
    const name1 = await getWorktreeName(page)
    expect(name1).toBeTruthy()
    await stopSession(page)

    // Second session
    await startSession(page)
    const name2 = await getWorktreeName(page)
    expect(name2).toBe(name1)

    // Still only one worktree dir
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('repairs worktree when dir deleted', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'Repair task', tempDirs)

    // Start and stop to create worktree
    await startSession(page)
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    await stopSession(page)

    // Delete the worktree directory externally
    const dirs = getWorktreeDirs(wtBase)
    expect(dirs.length).toBe(1)
    rmSync(`${wtBase}/${dirs[0]}`, { recursive: true, force: true })

    // Also prune stale entries so git doesn't see it
    const { execSync } = await import('child_process')
    try {
      execSync('git worktree prune', { cwd: repoDir, stdio: 'ignore' })
    } catch {
      // ignore
    }

    // Start session again — should repair
    await startSession(page)
    const name2 = await getWorktreeName(page)
    expect(name2).toBeTruthy()

    // Worktree should be back
    assertWorktreeExists(repoDir, name2!)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Worktree cleanup
// ---------------------------------------------------------------------------
test.describe('worktree cleanup', () => {
  test('deleting task removes worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'Delete me', tempDirs)

    await startSession(page)
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    await stopSession(page)

    // Delete the task
    await deleteTask(page, 'Delete me')

    // Wait for async cleanup (directory disappears before branch is deleted)
    await waitForWorktreeCleanup(wtBase, 0)
    assertWorktreeNotExists(repoDir, name!)
    await waitForBranchCleanup(repoDir, `worktree/${name}`)
  })

  test('cascade deletion cleans up all owned worktrees', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'CascadeParent', tempDirs)

    // Start session on parent
    await startSession(page)
    const parentWt = await getWorktreeName(page)
    expect(parentWt).toBeTruthy()
    await stopSession(page)

    // Add child that opts out
    await addSubtask(page, 'CascadeParent', 'CascadeChild')
    await clickTask(page, 'CascadeChild')
    await selectTaskWorktreeMode(page, 'own-worktree')

    // Start session on child
    await startSession(page)
    const childWt = await getWorktreeName(page)
    expect(childWt).toBeTruthy()
    expect(childWt).not.toBe(parentWt)
    await stopSession(page)

    expect(getWorktreeDirs(wtBase).length).toBe(2)

    // Delete parent — should cascade
    await deleteTask(page, 'CascadeParent')

    await waitForWorktreeCleanup(wtBase, 0)
  })

  test('deleting inheriting child preserves parent worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'KeepParent', tempDirs)

    // Start session to create worktree
    await startSession(page)
    const parentWt = await getWorktreeName(page)
    expect(parentWt).toBeTruthy()
    await stopSession(page)

    // Add inheriting child
    await addSubtask(page, 'KeepParent', 'RemoveChild')
    await clickTask(page, 'RemoveChild')

    // Delete the child
    await deleteTask(page, 'RemoveChild')

    // Parent worktree should still exist
    await waitForWorktreeCleanup(wtBase, 1)
    assertWorktreeExists(repoDir, parentWt!)

    // Select parent — worktree name still shows
    await clickTask(page, 'KeepParent')
    const name = await getWorktreeName(page)
    expect(name).toBe(parentWt)
  })
})

// ---------------------------------------------------------------------------
// Settings UI
// ---------------------------------------------------------------------------
test.describe('settings UI', () => {
  test('locked task keeps worktree despite global default change', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'Toggle task', tempDirs)

    // Start session — worktree name visible, task locked
    await startSession(page)
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    await stopSession(page)

    // Change default to no-worktree — locked task keeps its worktree
    await setDefaultWorktreeMode(page, 'no-worktree')
    const afterName = await getWorktreeName(page)
    expect(afterName).toBe(name)
  })

  test('changing base dir only affects new worktrees', async () => {
    const wtBase1 = createWorktreeBaseDir()
    const wtBase2 = createWorktreeBaseDir()
    tempDirs.push(wtBase1, wtBase2)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase1)
    await createTaskWithDir(app, page, 'DirChange1', tempDirs)

    // Start session — worktree created in base1
    await startSession(page)
    const name1 = await getWorktreeName(page)
    expect(name1).toBeTruthy()
    expect(getWorktreeDirs(wtBase1).length).toBe(1)
    await stopSession(page)

    // Change base dir to base2
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase2)

    // First task still uses its original worktree in base1
    await startSession(page)
    const cwdAfter = normalizePath(await getTerminalCwd(page))
    expect(cwdAfter.startsWith(wtBase1)).toBe(true)
    await stopSession(page)

    // Create a second task — should use base2
    await createTaskWithDir(app, page, 'DirChange2', tempDirs)
    await startSession(page)
    const name2 = await getWorktreeName(page)
    expect(name2).toBeTruthy()
    expect(name2).not.toBe(name1)
    expect(getWorktreeDirs(wtBase2).length).toBe(1)
    const cwd2 = normalizePath(await getTerminalCwd(page))
    expect(cwd2.startsWith(wtBase2)).toBe(true)
  })

  test('no worktree info when default is no-worktree', async () => {
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'no-worktree')
    await createTaskWithDir(app, page, 'Disabled task', tempDirs)

    await startSession(page)
    expect(await getWorktreeName(page)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Worktree v2 — mode & locking
// ---------------------------------------------------------------------------
test.describe('worktree v2 — mode & locking', () => {
  test('default mode is Inherit, unlocked, dropdown visible', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ModeTest', tempDirs)

    // Dropdown should be visible (unlocked)
    expect(await isWorktreeLocked(page)).toBe(false)

    // Resolved mode hint should show effective mode
    const hint = await getResolvedModeHint(page)
    expect(hint).toContain('own worktree')
  })

  test('set Own worktree shows Create button', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'CreateBtn', tempDirs)

    await selectTaskWorktreeMode(page, 'own-worktree')

    // Create button should appear
    await expect(page.getByTestId('create-worktree-btn')).toBeVisible()

    // Still unlocked
    expect(await isWorktreeLocked(page)).toBe(false)
  })

  test('Create button creates worktree and locks', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'CreateLock', tempDirs)

    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)

    // Wait for worktree name to appear
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()

    // Should be locked now
    expect(await isWorktreeLocked(page)).toBe(true)

    // Worktree on disk
    assertWorktreeExists(repoDir, name!)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('set No worktree, start session → locks to no worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'NoWT', tempDirs)

    await selectTaskWorktreeMode(page, 'no-worktree')
    await startSession(page)

    // Locked
    expect(await isWorktreeLocked(page)).toBe(true)

    // No worktree
    expect(await getWorktreeName(page)).toBeNull()
    expect(getWorktreeDirs(wtBase).length).toBe(0)

    // CWD is repo dir
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd).toBe(normalizePath(repoDir))
  })

  test('cannot change mode once locked', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'LockTest', tempDirs)

    await startSession(page)

    // Should be locked — dropdown gone
    expect(await isWorktreeLocked(page)).toBe(true)
  })

  test('shared pattern — parent creates, children inherit', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'SharedParent', tempDirs)

    // Parent selects own-worktree and clicks Create
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const parentWt = await getWorktreeName(page)
    expect(parentWt).toBeTruthy()

    // Add child (inherits)
    await addSubtask(page, 'SharedParent', 'SharedChild')
    await clickTask(page, 'SharedChild')

    // Start session on child — should use parent's worktree
    await startSession(page)
    const childWt = await getWorktreeName(page)
    expect(childWt).toBe(parentWt)
    expect(await isWorktreeInherited(page)).toBe(true)

    // Only 1 worktree dir
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('independent pattern — parent sets intent, children get own worktrees', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'IndepParent', tempDirs)

    // Parent selects own-worktree but does NOT click Create
    await selectTaskWorktreeMode(page, 'own-worktree')

    // Add children
    await addSubtask(page, 'IndepParent', 'ChildB')
    await addSubtask(page, 'IndepParent', 'ChildC')

    // Start session on ChildB
    await clickTask(page, 'ChildB')
    await startSession(page)
    const wtB = await getWorktreeName(page)
    expect(wtB).toBeTruthy()
    expect(await isWorktreeInherited(page)).toBe(false)
    await stopSession(page)

    // Start session on ChildC
    await clickTask(page, 'ChildC')
    await startSession(page)
    const wtC = await getWorktreeName(page)
    expect(wtC).toBeTruthy()
    expect(wtC).not.toBe(wtB)
    expect(await isWorktreeInherited(page)).toBe(false)

    // At least 2 worktree dirs
    expect(getWorktreeDirs(wtBase).length).toBeGreaterThanOrEqual(2)

    // Parent still has no worktree (intent-only, never created or started session)
    await clickTask(page, 'IndepParent')
    expect(await getWorktreeName(page)).toBeNull()
  })

  test('mixed — parent creates, child A inherits, child B overrides', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'MixedParent', tempDirs)

    // Parent creates worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const parentWt = await getWorktreeName(page)

    // Child A (inherits)
    await addSubtask(page, 'MixedParent', 'MixChildA')
    await clickTask(page, 'MixChildA')
    await startSession(page)
    const wtA = await getWorktreeName(page)
    expect(wtA).toBe(parentWt)
    await stopSession(page)

    // Child B (overrides)
    await addSubtask(page, 'MixedParent', 'MixChildB')
    await clickTask(page, 'MixChildB')
    await selectTaskWorktreeMode(page, 'own-worktree')
    await startSession(page)
    const wtB = await getWorktreeName(page)
    expect(wtB).toBeTruthy()
    expect(wtB).not.toBe(parentWt)

    // 2 worktree dirs total
    expect(getWorktreeDirs(wtBase).length).toBe(2)
  })

  test('delete own worktree reverts to unlocked Inherit', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'DeleteRevert', tempDirs)

    // Create worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()

    // Delete worktree
    await clickDeleteWorktree(page)

    // Wait for cleanup
    await waitForWorktreeCleanup(wtBase, 0)

    // Worktree removed
    assertWorktreeNotExists(repoDir, name!)
    await waitForBranchCleanup(repoDir, `worktree/${name}`)

    // Task is unlocked, dropdown reappears
    expect(await isWorktreeLocked(page)).toBe(false)
    expect(await getWorktreeName(page)).toBeNull()
  })

  test('delete with inheriting descendants resets them', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'DelParent', tempDirs)

    // Parent creates worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })

    // Child inherits and starts session (locks)
    await addSubtask(page, 'DelParent', 'DelChild')
    await clickTask(page, 'DelChild')
    await startSession(page)
    expect(await isWorktreeLocked(page)).toBe(true)
    await stopSession(page)

    // Delete parent's worktree
    await clickTask(page, 'DelParent')
    await clickDeleteWorktree(page)

    await waitForWorktreeCleanup(wtBase, 0)

    // Parent reverts to unlocked
    expect(await isWorktreeLocked(page)).toBe(false)

    // Child also reverts to unlocked
    await clickTask(page, 'DelChild')
    expect(await isWorktreeLocked(page)).toBe(false)
    expect(await getWorktreeName(page)).toBeNull()
  })

  test('delete then re-create gets new worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ReCreate', tempDirs)

    // Create worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const name1 = await getWorktreeName(page)

    // Delete
    await clickDeleteWorktree(page)
    await waitForWorktreeCleanup(wtBase, 0)

    // Re-create
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const name2 = await getWorktreeName(page)

    expect(name2).toBeTruthy()
    expect(name2).not.toBe(name1)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('cannot delete inherited worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'NoDelParent', tempDirs)

    // Parent creates worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })

    // Child inherits
    await addSubtask(page, 'NoDelParent', 'NoDelChild')
    await clickTask(page, 'NoDelChild')
    await startSession(page)
    await stopSession(page)

    // Child has no delete button
    const deleteBtn = page.getByTestId('delete-worktree-btn')
    expect(await deleteBtn.isVisible().catch(() => false)).toBe(false)
  })

  test('intent-only parent transparent, grandparent concrete inherited (#15)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'no-worktree', wtBase)

    // A — own-worktree, created (concrete)
    await createTaskWithDir(app, page, 'GrandA', tempDirs)
    await selectTaskWorktreeMode(page, 'own-worktree')
    await clickCreateWorktree(page)
    await expect(page.getByTestId('worktree-name')).toBeVisible({ timeout: 10000 })
    const grandparentWt = await getWorktreeName(page)
    expect(grandparentWt).toBeTruthy()

    // B — own-worktree, NOT created (intent-only → transparent)
    await addSubtask(page, 'GrandA', 'MidB')
    await clickTask(page, 'MidB')
    await selectTaskWorktreeMode(page, 'own-worktree')

    // C — inherit → should see through B's intent and inherit A's concrete worktree
    await addSubtask(page, 'MidB', 'LeafC')
    await clickTask(page, 'LeafC')
    await startSession(page)

    const leafWt = await getWorktreeName(page)
    expect(leafWt).toBe(grandparentWt)
    expect(await isWorktreeInherited(page)).toBe(true)

    // Still only 1 worktree dir on disk
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('global default No worktree — unlocked tasks resolve to no worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'no-worktree', wtBase)
    const repoDir = await createTaskWithDir(app, page, 'GlobalNo', tempDirs)

    // Resolved mode hint should show no worktree
    const hint = await getResolvedModeHint(page)
    expect(hint).toContain('no worktree')

    // Start session → CWD is repo dir
    await startSession(page)
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd).toBe(normalizePath(repoDir))
  })

  test('per-task override beats global', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'no-worktree', wtBase)
    await createTaskWithDir(app, page, 'Override', tempDirs)

    // Override to own-worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await startSession(page)

    // Should create worktree despite global default
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// No-worktree lock clearing
// ---------------------------------------------------------------------------
test.describe('no-worktree lock clearing', () => {
  test('clear no-worktree lock reverts to unlocked Inherit', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ClearLock', tempDirs)

    // Lock to no worktree
    await selectTaskWorktreeMode(page, 'no-worktree')
    await startSession(page)
    expect(await isWorktreeLocked(page)).toBe(true)
    await stopSession(page)

    // Clear the lock
    await clickClearNoWorktreeLock(page)

    // Should be unlocked with dropdown visible
    expect(await isWorktreeLocked(page)).toBe(false)

    // Resolved mode hint should show global default (own worktree)
    const hint = await getResolvedModeHint(page)
    expect(hint).toContain('own worktree')
  })

  test('clear then start with worktree', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ClearThenWT', tempDirs)

    // Lock to no worktree
    await selectTaskWorktreeMode(page, 'no-worktree')
    await startSession(page)
    expect(await isWorktreeLocked(page)).toBe(true)
    await stopSession(page)

    // Clear the lock
    await clickClearNoWorktreeLock(page)
    expect(await isWorktreeLocked(page)).toBe(false)

    // Now select own-worktree and start session — should get a worktree
    await selectTaskWorktreeMode(page, 'own-worktree')
    await startSession(page)

    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    expect(await isWorktreeLocked(page)).toBe(true)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('clear button hidden during active session', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'ClearHidden', tempDirs)

    // Lock to no worktree
    await selectTaskWorktreeMode(page, 'no-worktree')
    await startSession(page)
    expect(await isWorktreeLocked(page)).toBe(true)

    // Clear button should NOT be visible while session is active
    const clearBtn = page.getByTestId('clear-no-worktree-lock-btn')
    expect(await clearBtn.isVisible().catch(() => false)).toBe(false)

    await stopSession(page)

    // After stopping, clear button should appear
    await expect(clearBtn).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// No-worktree Lock button & transparency
// ---------------------------------------------------------------------------
test.describe('no-worktree lock button & transparency', () => {
  test('Lock button locks no-worktree immediately', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'LockBtn', tempDirs)

    await selectTaskWorktreeMode(page, 'no-worktree')
    await expect(page.getByTestId('lock-no-worktree-btn')).toBeVisible()

    await clickLockNoWorktree(page)

    // Should be locked — dropdown gone
    expect(await isWorktreeLocked(page)).toBe(true)
    expect(await getWorktreeName(page)).toBeNull()
  })

  test('locked no-worktree parent propagates to children', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'LockedNoWTParent', tempDirs)

    // Parent: lock to no worktree
    await selectTaskWorktreeMode(page, 'no-worktree')
    await clickLockNoWorktree(page)
    expect(await isWorktreeLocked(page)).toBe(true)

    // Add child (inherits)
    await addSubtask(page, 'LockedNoWTParent', 'LockedNoWTChild')
    await clickTask(page, 'LockedNoWTChild')

    // Child should resolve to no worktree (inherited from locked parent)
    const hint = await getResolvedModeHint(page)
    expect(hint).toContain('no worktree')

    // Start session on child — should use repo dir, no worktree
    await startSession(page)
    expect(await getWorktreeName(page)).toBeNull()
    expect(await isWorktreeLocked(page)).toBe(true)
    expect(getWorktreeDirs(wtBase).length).toBe(0)
  })

  test('unlocked no-worktree parent is transparent to children', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await setDefaultWorktreeMode(page, 'own-worktree', wtBase)
    await createTaskWithDir(app, page, 'TransNoWTParent', tempDirs)

    // Parent: set no-worktree but do NOT lock
    await selectTaskWorktreeMode(page, 'no-worktree')

    // Add child (inherits)
    await addSubtask(page, 'TransNoWTParent', 'TransNoWTChild')
    await clickTask(page, 'TransNoWTChild')

    // Child should resolve to global default (own worktree), not parent's unlocked no-worktree
    const hint = await getResolvedModeHint(page)
    expect(hint).toContain('own worktree')

    // Start session on child — should get its own worktree
    await startSession(page)
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })
})
