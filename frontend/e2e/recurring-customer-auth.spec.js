import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixturePath = fileURLToPath(new URL('../playwright/.auth/recurring-customer-fixture.json', import.meta.url));
const fixtureAvailable = existsSync(fixturePath);
const fixture = fixtureAvailable ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;

function featurePath(url) {
  const pathname = new URL(url).pathname;
  return pathname.startsWith('/api/v1/booking-series') ? pathname : null;
}

async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll - dimensions.width).toBeLessThanOrEqual(1);
}

test.describe('authenticated Customer recurring booking runtime', () => {
  test.skip(!fixtureAvailable, 'Run the isolated recurring Customer E2E fixture setup first.');

  test('list, detail, mixed occurrences and cancellation modal remain read-only', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const unexpectedResponses = [];
    const requests = [];
    const metrics = {};
    const requestStarts = new Map();

    page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('request', request => {
      requestStarts.set(request, Date.now());
      const path = featurePath(request.url());
      if (path) requests.push({ method: request.method(), path, query: new URL(request.url()).search, started: Date.now() });
    });
    page.on('response', response => {
      const url = new URL(response.url());
      const item = [...requests].reverse().find(candidate => candidate.path === url.pathname && candidate.query === url.search && candidate.durationMs === undefined);
      if (item) item.durationMs = Date.now() - (requestStarts.get(response.request()) ?? item.started);
      if (url.pathname.startsWith('/api/v1/') && response.status() >= 400) unexpectedResponses.push({ path: url.pathname, status: response.status() });
    });

    const listStart = Date.now();
    const listRequestStart = requests.length;
    await page.goto('/booking-series');
    await expect(page.getByRole('heading', { name: 'Lịch cố định', level: 1 })).toBeVisible();
    const detailLink = page.getByRole('link', { name: /Xem chi tiết/ }).first();
    await expect(detailLink).toBeVisible({ timeout: 30_000 });
    await expect(detailLink).toHaveAttribute('href', `/booking-series/${fixture.series_id}`);
    metrics.listVisibleMs = Date.now() - listStart;
    const listRequests = requests.slice(listRequestStart).filter(item => item.method === 'GET');
    expect(listRequests.filter(item => item.path === '/api/v1/booking-series')).toHaveLength(1);
    expect(listRequests.filter(item => /^\/api\/v1\/booking-series\/[^/]+$/.test(item.path))).toHaveLength(0);
    await expectNoOverflow(page);

    if (testInfo.project.name === 'recurring-customer-desktop') {
      await page.screenshot({ path: '../docs/ui-reference/recurring-customer-list-desktop.png', fullPage: true });
    }

    const detailStart = Date.now();
    const detailRequestStart = requests.length;
    await page.goto(`/booking-series/${fixture.series_id}`);
    await expect(page).toHaveURL(new RegExp(`/booking-series/${fixture.series_id}$`));
    await expect(page.getByRole('heading', { name: 'Chi tiết lịch đặt cố định', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('listitem')).toHaveCount(4, { timeout: 30_000 });
    metrics.detailVisibleMs = Date.now() - detailStart;
    const detailRequests = requests.slice(detailRequestStart).filter(item => item.method === 'GET');
    expect(detailRequests.filter(item => item.path === `/api/v1/booking-series/${fixture.series_id}`)).toHaveLength(1);
    expect(detailRequests.filter(item => /\/bookings\//.test(item.path))).toHaveLength(0);
    expect(detailRequests.filter(item => /\/refunds\//.test(item.path))).toHaveLength(0);
    expect(detailRequests.filter(item => /\/payments\//.test(item.path))).toHaveLength(0);

    await expect(page.getByText('Đã hoàn thành', { exact: true })).toBeVisible();
    await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
    await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Đang chờ chủ sân hoàn cọc', { exact: true })).toBeVisible();
    await expect(page.getByText('Chủ sân chưa gửi minh chứng hoàn tiền.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xem minh chứng hoàn tiền' })).toHaveCount(0);
    const cancelButton = page.getByRole('button', { name: 'Hủy buổi này', exact: true }).first();
    await expect(cancelButton).toBeVisible();
    await expect(cancelButton).toBeEnabled();
    await expect(page.locator('h1')).toHaveCount(1);
    await expectNoOverflow(page);

    const suffix = testInfo.project.name.replace('recurring-customer-', '');
    await page.screenshot({ path: `../docs/ui-reference/recurring-customer-detail-${suffix}.png`, fullPage: true });
    if (suffix === 'desktop') {
      await page.screenshot({ path: '../docs/ui-reference/recurring-customer-refund-desktop.png', fullPage: true });
      await cancelButton.focus();
      await cancelButton.click();
      const dialog = page.getByRole('dialog', { name: 'Hủy buổi đặt sân?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Số tiền dự kiến hoàn')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Hủy buổi này', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Quay lại', exact: true })).toBeVisible();
      await expectNoOverflow(page);
      await page.screenshot({ path: '../docs/ui-reference/recurring-customer-cancel-modal.png', fullPage: true });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(cancelButton).toBeFocused();
    }

    await page.getByRole('link', { name: /Quay lại lịch cố định/ }).click();
    await expect(page).toHaveURL(/\/booking-series$/);
    await expect(detailLink).toBeVisible();
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/booking-series/${fixture.series_id}`),
      detailLink.click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/booking-series/${fixture.series_id}$`));
    await expect(page.getByRole('heading', { name: 'Chi tiết lịch đặt cố định', level: 1 })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(4, { timeout: 30_000 });
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/booking-series'),
      page.goBack(),
    ]);
    await expect(page).toHaveURL(/\/booking-series$/);
    await expect(page.getByRole('heading', { name: 'Lịch cố định', level: 1 })).toBeVisible();
    await expect(detailLink).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/booking-series/${fixture.series_id}`),
      page.goForward(),
    ]);
    await expect(page).toHaveURL(new RegExp(`/booking-series/${fixture.series_id}$`));
    await expect(page.getByRole('heading', { name: 'Chi tiết lịch đặt cố định', level: 1 })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(4, { timeout: 30_000 });
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/booking-series'),
      page.goBack(),
    ]);
    await expect(page).toHaveURL(/\/booking-series$/);
    await expect(page.getByRole('heading', { name: 'Lịch cố định', level: 1 })).toBeVisible();
    await expect(detailLink).toBeVisible({ timeout: 30_000 });

    expect(requests.filter(item => item.method !== 'GET')).toHaveLength(0);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(unexpectedResponses).toEqual([]);
    console.log('RECURRING_CUSTOMER_RUNTIME', JSON.stringify({
      project: testInfo.project.name,
      timing_ms: metrics,
      feature_gets: requests.filter(item => item.method === 'GET').map(({ path, query, durationMs }) => ({ path, query, durationMs })),
    }));
  });
});
