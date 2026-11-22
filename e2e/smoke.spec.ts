import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('configure, focus on a task, complete a block, see history', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await snap(page, 'landing');
  await page.getByRole('link', { name: 'Adjust the cycle' }).click();
  await page.getByLabel('Focus length (minutes)').fill('2');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText(/Settings saved/)).toBeVisible();

  await page.getByRole('link', { name: 'Timer' }).click();
  await expect(page.getByTestId('clock')).toHaveText('02:00');
  await page.getByLabel('New task').fill('Review pull request');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Start focus' }).click();
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('clock')).toHaveText('01:30');
  await page.keyboard.press('Space'); // pause via keyboard
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.runFor(91_000);
  await expect(page.getByText(/Focus block complete/)).toBeVisible();
  await expect(page.getByText('1/2 blocks')).toBeVisible();
  await expect(page.getByTestId('today-total')).toHaveText('2 min');
  await snap(page, 'timer');

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('cell', { name: 'Review pull request' })).toBeVisible();
  await checkMobile(page);
});
