import simpleGit from 'simple-git'

export type SimpleGit = ReturnType<typeof simpleGit>

export function createGit(dir: string): SimpleGit {
  return simpleGit(dir, { timeout: { block: 15000 } })
}

export async function detectDefaultBranch(git: SimpleGit): Promise<string> {
  const branchSummary = await git.branch()
  if (branchSummary.all.includes('main')) return 'main'
  if (branchSummary.all.includes('master')) return 'master'
  return branchSummary.current || 'main'
}
