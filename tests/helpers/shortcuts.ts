import { Page, Locator } from 'playwright'

export interface ShortcutOptions {
  name: string
  type?: 'shell' | 'claude'
  command: string
  icon?: string
}

export async function addShortcut(page: Page, opts: ShortcutOptions): Promise<void> {
  const { name, type = 'shell', command, icon } = opts

  await page.getByTestId('add-shortcut-icon-button').click()

  // Wait for dialog to open
  await page.getByRole('dialog').waitFor({ state: 'visible' })

  // Fill in the name
  await page.getByTestId('shortcut-name-input').fill(name)

  // Select type if not the default
  if (type === 'claude') {
    await page.getByRole('button', { name: 'Claude prompt' }).click()
  }

  // Fill in the command
  await page.getByTestId('shortcut-command-input').fill(command)

  // Pick icon if specified
  if (icon) {
    await page.getByPlaceholder('Search icons...').fill(icon)
    await page.getByTestId(`shortcut-icon-option-${icon}`).first().click()
  }

  // Save
  await page.getByTestId('shortcut-save-button').click()

  // Wait for dialog to close
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}

export function getShortcutButtons(page: Page): Locator {
  return page.getByTestId('shortcut-button')
}

export async function deleteShortcut(page: Page, name: string): Promise<void> {
  const btn = page.locator(`[data-testid="shortcut-button"][title="${name}"]`)
  await btn.click({ button: 'right' })
  await page.getByTestId('shortcut-context-delete').click()
}

export async function editShortcut(page: Page, name: string): Promise<void> {
  const btn = page.locator(`[data-testid="shortcut-button"][title="${name}"]`)
  await btn.click({ button: 'right' })
  await page.getByTestId('shortcut-context-edit').click()

  // Wait for dialog to open
  await page.getByRole('dialog').waitFor({ state: 'visible' })
}
