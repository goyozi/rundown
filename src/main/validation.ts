import { z } from 'zod'

export const WorktreeRecordSchema = z.object({
  worktreeId: z.string(),
  name: z.string(),
  path: z.string(),
  branchName: z.string(),
  repoPath: z.string(),
  createdAt: z.string()
})

export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  defaultWorktreeMode: z.enum(['own-worktree', 'no-worktree']),
  worktreeBaseDir: z.string(),
  sessionResume: z.boolean()
})

export const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  directory: z.string().optional(),
  state: z.enum(['idle', 'done']),
  parentId: z.string().optional(),
  children: z.array(z.string()),
  createdAt: z.string(),
  groupId: z.string(),
  worktreeMode: z.enum(['inherit', 'own-worktree', 'no-worktree']).optional(),
  worktreeLocked: z.boolean().optional(),
  lockedToWorktreeId: z.string().optional(),
  worktree: WorktreeRecordSchema.optional(),
  sessionId: z.string().optional()
})

export const TaskGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  directory: z.string().optional(),
  createdAt: z.string()
})

export const TasksArraySchema = z.array(TaskSchema)
export const GroupsArraySchema = z.array(TaskGroupSchema)
export const RootTaskOrderSchema = z.record(z.string(), z.array(z.string()))
export const SidebarWidthSchema = z.number().min(100).max(2000)
export const ActiveGroupIdSchema = z.string()
export const ThemeSchema = z.enum(['light', 'dark', 'system'])

// Comment validation
export const CommentSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  changeKey: z.string(),
  lineNumber: z.number(),
  body: z.string()
})
export const CommentsPoolSchema = z.record(z.string(), z.array(CommentSchema))

// Session report (HTTP endpoint payload)
export const SessionReportSchema = z.object({
  taskId: z.string().min(1),
  sessionId: z.string().min(1)
})

// PTY validation
export const SessionIdSchema = z.string().min(1)
export const PtyThemeSchema = z.enum(['light', 'dark'])
export const CwdSchema = z.string().min(1)
export const PtyWriteDataSchema = z.string()
export const PtyResizeSchema = z.object({
  cols: z.number().int().min(1).max(500),
  rows: z.number().int().min(1).max(500)
})

// Git validation
export const DirPathSchema = z.string().min(1)
export const BranchNameSchema = z.string().min(1)
