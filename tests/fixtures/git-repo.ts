import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

export function createTempGitRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rundown-test-'))
  execSync('git init && git commit --allow-empty -m "init"', { cwd: dir, stdio: 'ignore' })
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 1;\n')
  execSync('git add . && git commit -m "initial file"', { cwd: dir, stdio: 'ignore' })
  return dir
}

export function dirtyRepo(dir: string): void {
  writeFileSync(path.join(dir, 'index.ts'), 'export const x = 2; // changed\n')
}
