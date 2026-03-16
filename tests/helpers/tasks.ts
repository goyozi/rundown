import { Page } from 'playwright'

export async function createTask(page: Page, description: string): Promise<void> {
  const input = page.getByTestId('new-task-input')
  await input.fill(description)
  await input.press('Enter')
  // Wait for the task to appear in the list
  await page.getByText(description).waitFor()
}

export async function getTaskItem(
  page: Page,
  description: string
): Promise<import('playwright').Locator> {
  return page.locator(`[data-task-description="${description}"]`)
}

export async function hoverTask(page: Page, description: string): Promise<void> {
  const item = page.locator(`[data-task-description="${description}"]`)
  await item.hover()
}

export async function editTaskDescription(
  page: Page,
  oldDescription: string,
  newDescription: string
): Promise<void> {
  await hoverTask(page, oldDescription)
  const item = page.locator(`[data-task-description="${oldDescription}"]`)
  await item.getByTestId('edit-task').click()
  const editInput = item.locator('input')
  await editInput.fill(newDescription)
  await editInput.press('Enter')
  await page.getByText(newDescription).waitFor()
}

export async function deleteTask(page: Page, description: string): Promise<void> {
  await hoverTask(page, description)
  const item = page.locator(`[data-task-description="${description}"]`)
  await item.getByTestId('delete-task').click()
  await page.getByTestId('confirm-delete').click()
}

export async function addSubtask(
  page: Page,
  parentDescription: string,
  childDescription: string
): Promise<void> {
  await hoverTask(page, parentDescription)
  const item = page.locator(`[data-task-description="${parentDescription}"]`)
  await item.getByTestId('add-subtask').click()
  const subtaskInput = page.getByTestId('subtask-input')
  await subtaskInput.fill(childDescription)
  await subtaskInput.press('Enter')
  await page.getByText(childDescription).waitFor()
}

export async function markTaskDone(page: Page, description: string): Promise<void> {
  const item = page.locator(`[data-task-description="${description}"]`)
  await item.getByTestId('toggle-done').click()
}

export async function clickTask(page: Page, description: string): Promise<void> {
  const item = page.locator(`[data-task-description="${description}"]`)
  await item.click()
}
