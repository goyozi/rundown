import React from 'react'
import { tokenize, markEdits, isInsert, isDelete, isNormal } from 'react-diff-view'
import type { FileData, HunkData, ChangeData } from 'react-diff-view'
import refractor from 'refractor'
import { FileCode2, FilePlus2, FileX2, FileDiff } from 'lucide-react'

export interface DiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'docker',
  makefile: 'makefile'
}

export function detectLanguage(filePath: string): string | undefined {
  const name = filePath.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'docker'
  if (name === 'makefile') return 'makefile'
  const ext = name.split('.').pop() ?? ''
  const lang = EXT_TO_LANG[ext]
  if (!lang) return undefined
  try {
    refractor.highlight('', lang)
    return lang
  } catch {
    return undefined
  }
}

export function tokenizeFile(file: FileData): ReturnType<typeof tokenize> | undefined {
  const path = resolveFilePath(file)
  const language = detectLanguage(path)
  if (!language) return undefined
  try {
    return tokenize(file.hunks as HunkData[], {
      highlight: true,
      refractor,
      language,
      enhancers: [markEdits(file.hunks as HunkData[])]
    })
  } catch {
    return undefined
  }
}

/** Resolve the display path for a file, preferring the real path over /dev/null */
export function resolveFilePath(file: FileData): string {
  const newP = file.newPath === '/dev/null' ? '' : file.newPath
  const oldP = file.oldPath === '/dev/null' ? '' : file.oldPath
  return newP || oldP
}

export function computeStats(files: FileData[]): DiffStats {
  let additions = 0
  let deletions = 0
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (isInsert(change)) additions++
        if (isDelete(change)) deletions++
      }
    }
  }
  return { filesChanged: files.length, additions, deletions }
}

export function fileIcon(type: string): React.ReactElement {
  switch (type) {
    case 'add':
      return <FilePlus2 className="size-3.5 text-success shrink-0" />
    case 'delete':
      return <FileX2 className="size-3.5 text-destructive shrink-0" />
    case 'rename':
      return <FileDiff className="size-3.5 text-chart-2 shrink-0" />
    default:
      return <FileCode2 className="size-3.5 text-muted-foreground shrink-0" />
  }
}

export function fileStats(file: FileData): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (isInsert(change)) adds++
      if (isDelete(change)) dels++
    }
  }
  return { adds, dels }
}

export function getLineNumber(change: ChangeData): number {
  if (isNormal(change)) return change.newLineNumber
  return change.lineNumber
}
