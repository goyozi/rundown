import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { rmSync } from 'fs'
import { launchApp } from './helpers/app'
import { createTask, clickTask, addSubtask, deleteTask } from './helpers/tasks'
import { startSession, stopSession, createTaskWithDir } from './helpers/sessions'
import {
  enableWorktrees,
  disableWorktrees,
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
// Worktree creation — spec scenarios #1–#5
// ---------------------------------------------------------------------------
test.describe('worktree creation', () => {
  test('creates worktree on CC session start (#1, #22)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    const repoDir = await createTaskWithDir(app, page, 'WT task', tempDirs)

    await startSession(page)

    // UI: worktree name visible
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()

    // Git: worktree exists
    assertWorktreeExists(repoDir, name!)

    // Filesystem: one dir in base
    expect(getWorktreeDirs(wtBase).length).toBe(1)

    // Terminal CWD is under worktree base dir
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)
  })

  test('creates worktree on shell tab (#2)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    const repoDir = await createTaskWithDir(app, page, 'Shell WT', tempDirs)

    // Open a shell tab instead of CC session
    await page.getByTestId('add-shell-tab').click()
    await expect(page.getByTestId('terminal-panel')).toBeVisible({ timeout: 10000 })

    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    assertWorktreeExists(repoDir, name!)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('skips worktree when disabled (#4)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    // Don't enable worktrees
    const repoDir = await createTaskWithDir(app, page, 'No WT', tempDirs)

    await startSession(page)

    // No worktree name visible
    const name = await getWorktreeName(page)
    expect(name).toBeNull()
    expect(getWorktreeDirs(wtBase).length).toBe(0)

    // Terminal CWD is the repo dir itself
    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd).toBe(normalizePath(repoDir))
  })

  test('uses custom base dir (#5)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    await createTaskWithDir(app, page, 'Custom dir', tempDirs)

    await startSession(page)

    const cwd = normalizePath(await getTerminalCwd(page))
    expect(cwd.startsWith(wtBase)).toBe(true)
    expect(getWorktreeDirs(wtBase).length).toBe(1)
  })

  test('no repo — start disabled (#3)', async () => {
    ;({ app, page } = await launchApp())
    await createTask(page, 'No repo task')
    await clickTask(page, 'No repo task')

    // Start button should be disabled (no directory)
    await expect(page.getByTestId('start-session')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Worktree inheritance — spec scenarios #6–#10
// ---------------------------------------------------------------------------
test.describe('worktree inheritance', () => {
  test('child inherits parent worktree (#6, #9)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
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

  test('child-first launch creates worktree on parent (#10)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    const repoDir = await createTaskWithDir(app, page, 'FirstParent', tempDirs)

    // Add subtask without starting parent session
    await addSubtask(page, 'FirstParent', 'FirstChild')
    await clickTask(page, 'FirstChild')

    // Start session on child — should create worktree on parent
    await startSession(page)
    const childWtName = await getWorktreeName(page)
    expect(childWtName).toBeTruthy()
    expect(await isWorktreeInherited(page)).toBe(true)

    // Go back to parent — should show same worktree
    await clickTask(page, 'FirstParent')
    const parentWtName = await getWorktreeName(page)
    expect(parentWtName).toBe(childWtName)

    expect(getWorktreeDirs(wtBase).length).toBe(1)
    assertWorktreeExists(repoDir, childWtName!)
  })

  test('opt-out gives child own worktree (#7)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    await createTaskWithDir(app, page, 'ParentOpt', tempDirs)

    // Start session on parent
    await startSession(page)
    const parentWtName = await getWorktreeName(page)
    expect(parentWtName).toBeTruthy()
    await stopSession(page)

    // Add subtask
    await addSubtask(page, 'ParentOpt', 'ChildOpt')
    await clickTask(page, 'ChildOpt')

    // Click opt-out button
    await page.getByTestId('toggle-own-worktree').click()

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

  test('chain break — grandchild inherits from opted-out child (#8)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    await createTaskWithDir(app, page, 'ChainRoot', tempDirs)

    // Start session on ChainRoot
    await startSession(page)
    const wtA = await getWorktreeName(page)
    expect(wtA).toBeTruthy()
    await stopSession(page)

    // ChainRoot → ChainMiddle (opts out)
    await addSubtask(page, 'ChainRoot', 'ChainMiddle')
    await clickTask(page, 'ChainMiddle')
    await page.getByTestId('toggle-own-worktree').click()

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
// Session resume — spec scenarios #11–#14
// ---------------------------------------------------------------------------
test.describe('session resume', () => {
  test('reuses worktree on session restart (#11)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
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

  test('repairs worktree when dir deleted (#12-14)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
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
// Worktree cleanup — spec scenarios #15–#18
// ---------------------------------------------------------------------------
test.describe('worktree cleanup', () => {
  test('deleting task removes worktree (#15)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
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

  test('cascade deletion cleans up all owned worktrees (#16, #18)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    await createTaskWithDir(app, page, 'CascadeParent', tempDirs)

    // Start session on parent
    await startSession(page)
    const parentWt = await getWorktreeName(page)
    expect(parentWt).toBeTruthy()
    await stopSession(page)

    // Add child that opts out
    await addSubtask(page, 'CascadeParent', 'CascadeChild')
    await clickTask(page, 'CascadeChild')
    await page.getByTestId('toggle-own-worktree').click()

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

  test('deleting inheriting child preserves parent worktree (#17)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
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
// Settings UI — spec scenarios #19–#22
// ---------------------------------------------------------------------------
test.describe('settings UI', () => {
  test('toggle off hides worktree name, toggle on restores (#19)', async () => {
    const wtBase = createWorktreeBaseDir()
    tempDirs.push(wtBase)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase)
    await createTaskWithDir(app, page, 'Toggle task', tempDirs)

    // Start session — worktree name visible
    await startSession(page)
    const name = await getWorktreeName(page)
    expect(name).toBeTruthy()
    await stopSession(page)

    // Disable worktrees
    await disableWorktrees(page)
    expect(await getWorktreeName(page)).toBeNull()

    // Re-enable
    await enableWorktrees(page, wtBase)
    const restored = await getWorktreeName(page)
    expect(restored).toBe(name)
  })

  test('changing base dir only affects new worktrees (#20)', async () => {
    const wtBase1 = createWorktreeBaseDir()
    const wtBase2 = createWorktreeBaseDir()
    tempDirs.push(wtBase1, wtBase2)
    ;({ app, page } = await launchApp())
    await enableWorktrees(page, wtBase1)
    await createTaskWithDir(app, page, 'DirChange1', tempDirs)

    // Start session — worktree created in base1
    await startSession(page)
    const name1 = await getWorktreeName(page)
    expect(name1).toBeTruthy()
    expect(getWorktreeDirs(wtBase1).length).toBe(1)
    await stopSession(page)

    // Change base dir to base2
    await enableWorktrees(page, wtBase2)

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

  test('no worktree info when disabled (#22)', async () => {
    ;({ app, page } = await launchApp())
    // Worktrees are off by default
    await createTaskWithDir(app, page, 'Disabled task', tempDirs)

    await startSession(page)
    expect(await getWorktreeName(page)).toBeNull()
  })
})
