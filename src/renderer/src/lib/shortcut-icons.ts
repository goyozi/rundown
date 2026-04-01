import { icons } from 'lucide-react'

/** Curated icons shown when no search query is entered */
export const CURATED_ICON_NAMES: string[] = [
  'GitBranch',
  'GitPullRequest',
  'GitMerge',
  'GitCommitHorizontal',
  'Play',
  'SquareTerminal',
  'Terminal',
  'Upload',
  'Download',
  'RefreshCw',
  'Rocket',
  'Wrench',
  'Settings',
  'Shield',
  'Zap',
  'Send',
  'Package',
  'Bug',
  'TestTubes',
  'Code'
]

const allIconNames = Object.keys(icons)

/**
 * Search lucide icons by name. Returns icon names matching the query.
 * If query is empty, returns curated list.
 */
export function searchIcons(query: string, limit: number = 40): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return CURATED_ICON_NAMES

  return allIconNames.filter((name) => name.toLowerCase().includes(trimmed)).slice(0, limit)
}
