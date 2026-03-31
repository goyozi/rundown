export const IPC = {
  // Store
  STORE_GET_TASKS: 'store:get-tasks',
  STORE_SAVE_TASKS: 'store:save-tasks',
  STORE_GET_GROUPS: 'store:get-groups',
  STORE_SAVE_GROUPS: 'store:save-groups',
  STORE_GET_ACTIVE_GROUP_ID: 'store:get-active-group-id',
  STORE_SAVE_ACTIVE_GROUP_ID: 'store:save-active-group-id',
  STORE_GET_SIDEBAR_WIDTH: 'store:get-sidebar-width',
  STORE_SAVE_SIDEBAR_WIDTH: 'store:save-sidebar-width',
  STORE_GET_ROOT_TASK_ORDER: 'store:get-root-task-order',
  STORE_SAVE_ROOT_TASK_ORDER: 'store:save-root-task-order',

  // Dialog
  DIALOG_OPEN_DIRECTORY: 'dialog:open-directory',

  // Git
  GIT_VALIDATE_REPO: 'git:validate-repo',
  GIT_DETECT_BRANCH: 'git:detect-branch',
  GIT_DIFF_UNCOMMITTED: 'git:diff-uncommitted',
  GIT_DIFF_BRANCH: 'git:diff-branch',

  // Comments
  STORE_GET_COMMENTS: 'store:get-comments',
  STORE_SAVE_COMMENTS: 'store:save-comments',

  // Settings
  STORE_GET_SETTINGS: 'store:get-settings',
  STORE_SAVE_SETTINGS: 'store:save-settings',

  // Worktree
  WORKTREE_CREATE: 'worktree:create',
  WORKTREE_ENSURE_HEALTHY: 'worktree:ensure-healthy',
  WORKTREE_CLEANUP: 'worktree:cleanup',

  // Session Resume
  SESSION_RESUME_SET: 'session-resume:set',

  // Error reporting
  RENDERER_LOG_ERROR: 'renderer:log-error',

  // Theme
  THEME_SET: 'theme:set',

  // PTY
  PTY_SPAWN: 'pty:spawn',
  PTY_SPAWN_SHELL: 'pty:spawn-shell',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  PTY_BUFFER_SNAPSHOT: 'pty:buffer-snapshot',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:open-external'
} as const
