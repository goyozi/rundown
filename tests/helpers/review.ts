import { expect } from '@playwright/test'
import { Page } from 'playwright'

export async function goToReview(page: Page): Promise<void> {
  await expect(page.getByTestId('tab-review')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('tab-review').click()
  await expect(page.getByTestId('review-panel')).toBeVisible({ timeout: 5000 })
}

export async function addCommentOnFirstGutter(page: Page): Promise<void> {
  const gutter = page.locator('.diff-gutter').first()
  await gutter.click()
}

export async function switchToBranchMode(page: Page): Promise<void> {
  await expect(page.getByTestId('mode-branch')).not.toHaveAttribute('disabled', '', {
    timeout: 5000
  })
  await page.getByTestId('mode-branch').click()
  await expect(page.getByTestId('diff-files')).toBeVisible({ timeout: 5000 })
}
