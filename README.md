# rundown

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## Keyboard Shortcuts

> On macOS, shortcuts use **Cmd (⌘)**. On Windows/Linux, use **Ctrl** instead.

### Global Navigation

These work from anywhere in the app, including inside the terminal.

| Shortcut      | Action                              |
| ------------- | ----------------------------------- |
| `⌘ T`         | Focus the task pane                 |
| `⌘ ↑` / `⌘ K` | Select previous task                |
| `⌘ ↓` / `⌘ J` | Select next task                    |
| `⌘ [`         | Navigate back                       |
| `⌘ ]`         | Navigate forward                    |
| `⌘ E`         | Open recent task switcher           |
| `⌘ 1` – `⌘ 9` | Switch to Nth tab in the right pane |

### Task List

Vim-style and arrow key navigation for the task list. Disabled when an input field or dialog is focused.

| Shortcut               | Action                                    |
| ---------------------- | ----------------------------------------- |
| `j` / `↓`              | Move selection down                       |
| `k` / `↑`              | Move selection up                         |
| `h` / `←`              | Collapse selected task                    |
| `l` / `→`              | Expand selected task                      |
| `Space`                | Toggle task done / incomplete             |
| `Enter`                | Add subtask to selected task              |
| `i`                    | Edit selected task                        |
| `Delete` / `Backspace` | Delete selected task                      |
| `Tab`                  | Indent task (nest under previous sibling) |
| `Shift Tab`            | Outdent task (move to parent's level)     |
| `⌘ ⇧ ↓` / `⌘ ⇧ J`      | Move task down                            |
| `⌘ ⇧ ↑` / `⌘ ⇧ K`      | Move task up                              |
