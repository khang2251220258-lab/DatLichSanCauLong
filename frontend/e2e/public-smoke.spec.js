import { expect, test } from '@playwright/test';

test('Home and public Facility navigation render without page errors', async ({ page }) => {
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    const errorText = request.failure()?.errorText || 'UNKNOWN';
    // React navigation intentionally aborts stale public reads. Keep that
    // distinct from a backend listener disappearing or resetting the socket.
    if (errorText !== 'net::ERR_ABORTED') failedRequests.push(`${request.url()} :: ${errorText}`);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Đặt sân cầu lông');
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Tìm sân', exact: true }).click();
  await expect(page).toHaveURL(/\/facilities(?:\?|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tìm sân cầu lông');
  await page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name: 'Trang chủ', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Đặt sân cầu lông');
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
