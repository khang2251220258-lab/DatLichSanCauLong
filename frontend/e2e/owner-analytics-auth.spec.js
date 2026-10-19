import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../playwright/.auth/owner-analytics-fixture.json', import.meta.url)), 'utf8'));
const analyticsPath = path => path === '/api/v1/owner/analytics/overview' || path === '/api/v1/owner/analytics/courts';

function monitor(page) {
  const requests = [], active = new Map(), consoleErrors = [], pageErrors = [], failed = [], badResponses = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/')) {
      const row = { method: request.method(), path: url.pathname, query: url.search, start: performance.now(), end: null, status: null };
      requests.push(row); active.set(request, row);
    }
  });
  page.on('response', response => {
    const row = active.get(response.request()); if (!row) return;
    row.end = performance.now(); row.status = response.status();
    if (response.status() >= 400) badResponses.push({ path: row.path, status: row.status });
  });
  page.on('requestfailed', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) failed.push({ path:new URL(request.url()).pathname, error:request.failure()?.errorText }); });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  return { requests, consoleErrors, pageErrors, failed, badResponses };
}

async function waitAnalytics(page) {
  await expect(page.getByRole('heading', { name: 'Thống kê hoạt động', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Chỉ số tổng quan')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Xu hướng đặt sân' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hiệu suất từng sân' })).toBeVisible();
}

async function noPageOverflow(page) {
  const width = await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, client:document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
}

test.describe('authenticated Owner Analytics runtime', () => {
  test('direct load, filters, request budgets, cache revisit and responsive screenshots', async ({ page }, testInfo) => {
    const events = monitor(page), started = Date.now();
    await page.goto('/owner/analytics');
    await waitAnalytics(page);
    const initialVisible = Date.now() - started;
    await expect(page.getByRole('link', { name: 'Thống kê' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Giá trị booking đã xác nhận')).toBeVisible();
    await expect(page.getByText('Booking đã xác nhận', { exact:true })).toBeVisible();
    await expect(page.getByText('Giờ đã xác nhận')).toBeVisible();
    await expect(page.getByText('Tỷ lệ lấp đầy')).toBeVisible();
    await expect(page.getByText(/không phải tổng tiền thực nhận/i)).toBeVisible();
    await expect(page.getByLabel('Bảng nhiệt mức sử dụng theo thứ và giờ')).toBeVisible();
    await expect(page.getByLabel('Bảng nhiệt mức sử dụng theo thứ và giờ').locator('[aria-label*="slot"]')).not.toHaveCount(0);
    await expect(page.getByText('TEST_E2E_OWNER_ANALYTICS_COURT_01')).toBeVisible();
    await expect(page.getByText('TEST_E2E_OWNER_ANALYTICS_COURT_21')).not.toBeVisible();
    await noPageOverflow(page);

    const initialFeature = events.requests.filter(row => analyticsPath(row.path));
    expect(initialFeature.filter(row => row.path.endsWith('/overview'))).toHaveLength(1);
    expect(initialFeature.filter(row => row.path.endsWith('/courts'))).toHaveLength(1);
    const overview = initialFeature.find(row => row.path.endsWith('/overview'));
    const courts = initialFeature.find(row => row.path.endsWith('/courts'));
    expect(overview.status).toBe(200); expect(courts.status).toBe(200);
    expect(overview.start).toBeLessThan(courts.end);
    expect(courts.start).toBeLessThan(overview.end);
    expect(new URL(page.url()).searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new URL(page.url()).searchParams.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page.url()).not.toContain('owner_id=');

    const suffix = testInfo.project.name.replace('owner-analytics-', '');
    await page.screenshot({ path:`../docs/ui-reference/owner-analytics-${suffix}.png`, fullPage:true });

    if (suffix === 'desktop') {
      await expect(page.getByRole('table', { name:'Hiệu suất từng sân' })).toBeVisible();
      const beforePageOverview = events.requests.filter(row => row.path.endsWith('/overview')).length;
      const beforePageCourts = events.requests.filter(row => row.path.endsWith('/courts')).length;
      await Promise.all([
        page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/analytics/courts') && new URL(response.url()).searchParams.get('page') === '2'),
        page.getByRole('button', { name:'Sau' }).click(),
      ]);
      await expect(page.getByText('TEST_E2E_OWNER_ANALYTICS_COURT_21')).toBeVisible();
      expect(events.requests.filter(row => row.path.endsWith('/overview'))).toHaveLength(beforePageOverview);
      expect(events.requests.filter(row => row.path.endsWith('/courts'))).toHaveLength(beforePageCourts + 1);
      expect(new URL(page.url()).searchParams.get('page')).toBe('2');
      await page.getByRole('button', { name:'Trước', exact:true }).click();
      await expect(page.getByText('TEST_E2E_OWNER_ANALYTICS_COURT_01')).toBeVisible();

      const beforeFilter = events.requests.filter(row => analyticsPath(row.path)).length;
      const sevenDayResponses = Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/analytics/overview') && new URL(response.url()).searchParams.get('from') !== '2026-09-19'),
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/analytics/courts') && new URL(response.url()).searchParams.get('from') !== '2026-09-19'),
      ]);
      await page.getByRole('button', { name:'7 ngày' }).click();
      expect((await sevenDayResponses).map(response => response.status())).toEqual([200, 200]);
      await expect.poll(() => events.requests.filter(row => analyticsPath(row.path)).length).toBe(beforeFilter + 2);
      await expect(page.getByLabel('Chỉ số tổng quan')).toBeVisible();
      expect(new URL(page.url()).searchParams.get('page')).toBeNull();

      const beforeFacility = events.requests.filter(row => analyticsPath(row.path)).length;
      await page.getByLabel('Cơ sở').selectOption(fixture.facility_id);
      const facilityResponses = Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/analytics/overview') && new URL(response.url()).searchParams.get('facility_id') === fixture.facility_id),
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/analytics/courts') && new URL(response.url()).searchParams.get('facility_id') === fixture.facility_id),
      ]);
      await page.getByRole('button', { name:'Áp dụng' }).click();
      expect((await facilityResponses).map(response => response.status())).toEqual([200, 200]);
      await expect.poll(() => events.requests.filter(row => analyticsPath(row.path)).length).toBe(beforeFacility + 2);
      expect(new URL(page.url()).searchParams.get('facility_id')).toBe(fixture.facility_id);

      await page.getByRole('link', { name:'Cơ sở của tôi' }).click();
      await expect(page).toHaveURL(/\/owner\/facilities/);
      const revisitStarted = Date.now();
      await page.getByRole('link', { name:'Thống kê' }).click();
      await expect(page.getByLabel('Chỉ số tổng quan')).toBeVisible();
      const revisitVisible = Date.now() - revisitStarted;
      await expect(page.getByRole('link', { name:'Thống kê' })).toHaveAttribute('aria-current', 'page');
      await page.goBack(); await expect(page).toHaveURL(/\/owner\/facilities/);
      await page.goForward(); await expect(page).toHaveURL(/\/owner\/analytics/); await waitAnalytics(page);
      console.log('OWNER_ANALYTICS_REVISIT_RUNTIME', JSON.stringify({ revisit_data_visible_ms:revisitVisible }));
    } else {
      await expect(page.locator('.oa-table-row').filter({ hasText:'TEST_E2E_OWNER_ANALYTICS_COURT_01' })).toBeVisible();
    }

    await noPageOverflow(page);
    expect(await page.getByRole('heading', { level:1 }).count()).toBe(1);
    expect(events.requests.filter(row => row.method !== 'GET' && row.path.includes('/analytics'))).toHaveLength(0);
    expect(events.consoleErrors).toEqual([]); expect(events.pageErrors).toEqual([]);
    // Route/filter changes intentionally abort superseded reads. Only genuine
    // transport failures are runtime errors.
    expect(events.failed.filter(row => row.error !== 'net::ERR_ABORTED')).toEqual([]);
    expect(events.badResponses).toEqual([]);
    console.log('OWNER_ANALYTICS_RUNTIME', JSON.stringify({
      project:testInfo.project.name, initial_data_visible_ms:initialVisible,
      feature_gets:events.requests.filter(row => analyticsPath(row.path)).map(row => ({ path:row.path, query:row.query, status:row.status, start_ms:Math.round(row.start), duration_ms:row.end===null?null:Math.round(row.end-row.start) })),
    }));
  });
});
