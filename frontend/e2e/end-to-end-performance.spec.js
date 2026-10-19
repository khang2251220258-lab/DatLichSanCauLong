import { expect, test } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

function observeApi(page) {
  const records = [];
  const pending = new Map();
  page.on('request', request => {
    if (request.method() !== 'GET' || !request.url().includes('/api/v1/')) return;
    const record = { method:'GET', path:new URL(request.url()).pathname + new URL(request.url()).search, startedAt:Date.now() };
    records.push(record);
    pending.set(request, record);
  });
  page.on('response', response => {
    const record = pending.get(response.request());
    if (!record) return;
    record.endedAt = Date.now();
    record.durationMs = record.endedAt - record.startedAt;
    record.status = response.status();
    pending.delete(response.request());
  });
  page.on('requestfailed', request => {
    const record = pending.get(request);
    if (!record) return;
    record.endedAt = Date.now();
    record.durationMs = record.endedAt - record.startedAt;
    record.failure = request.failure()?.errorText || 'REQUEST_FAILED';
    pending.delete(request);
  });
  return records;
}

async function measureRoute(records, name, navigate, ready) {
  const start = Date.now();
  const requestOffset = records.length;
  await navigate();
  const firstMeaningfulMs = Date.now() - start;
  await ready();
  const dataVisibleMs = Date.now() - start;
  const requests = records.slice(requestOffset);
  return {
    name,
    firstMeaningfulMs,
    dataVisibleMs,
    requestCount:requests.length,
    duplicateGets:Object.entries(requests.reduce((counts, item) => ({ ...counts, [item.path]:(counts[item.path] || 0) + 1 }), {})).filter(([, count]) => count > 1),
    requests,
  };
}

async function loginAdmin(page) {
  await page.context().clearCookies();
  await page.goto('/admin/facilities');
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('input[name="email"]').fill(adminEmail);
  await page.locator('input[name="password"]').fill(adminPassword);
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/auth/login')),
    page.locator('form button[type="submit"]').click(),
  ]);
  await expect(page).toHaveURL(/\/admin\/facilities$/);
}

test('public list and detail loading audit stays read-only', async ({ page }, testInfo) => {
  const records = observeApi(page);
  const routes = [];
  routes.push(await measureRoute(records, 'home', () => page.goto('/'), async () => {
    await expect(page.locator('.home-page h1')).toBeVisible();
    await expect(page.locator('.home-facilities')).toBeVisible();
  }));
  routes.push(await measureRoute(records, 'facility-list', () => page.locator('a[href="/facilities"]').first().click(), async () => {
    await expect(page).toHaveURL(/\/facilities$/);
    await expect(page.locator('.fl-content')).toBeVisible();
    await expect(page.locator('.fl-content [aria-busy="false"]')).toBeVisible();
  }));
  const detailLink = page.locator('.fl-detail').first();
  if (await detailLink.count()) {
    routes.push(await measureRoute(records, 'facility-detail', () => detailLink.click(), async () => {
      await expect(page).toHaveURL(/\/facilities\/[^/]+$/);
      await expect(page.locator('.fd-main h1')).toBeVisible();
      await expect(page.locator('.fd-gallery')).toBeVisible();
    }));
  }
  await testInfo.attach('public-end-to-end-performance.json', { body:Buffer.from(JSON.stringify({ routes, records }, null, 2)), contentType:'application/json' });
  console.log('PUBLIC_E2E_PERFORMANCE', JSON.stringify(routes.map(route => ({ name:route.name, dataVisibleMs:route.dataVisibleMs, requestCount:route.requestCount, endpointMs:route.requests.map(item => [item.path, item.durationMs]) }))));
  expect(records.filter(item => item.failure && !item.failure.includes('ERR_ABORTED'))).toEqual([]);
  expect(routes.every(route => route.duplicateGets.length === 0)).toBe(true);
});

test.describe('Admin end-to-end loading audit', () => {
  test.skip(!(adminEmail && adminPassword), 'Missing existing read-only Admin credentials');
  test('all Admin list/detail routes and profile remain read-only', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const records = observeApi(page);
    await loginAdmin(page);
    const routes = [];
    routes.push(await measureRoute(records, 'admin-facilities', async () => {}, async () => {
      await expect(page.locator('.af-facility-table')).toBeVisible();
    }));

    const facilityDetail = page.locator('a[href^="/admin/facilities/"]').first();
    if (await facilityDetail.count()) routes.push(await measureRoute(records, 'admin-facility-detail', () => facilityDetail.click(), async () => {
      await expect(page).toHaveURL(/\/admin\/facilities\/[^/]+$/);
      await expect(page.locator('.af-detail-head h1')).toBeVisible();
    }));

    routes.push(await measureRoute(records, 'admin-owner-requests', () => page.locator('a[href="/admin/owner-requests"]').first().click(), async () => {
      await expect(page).toHaveURL(/\/admin\/owner-requests$/);
      await expect(page.locator('.or-admin-title h1')).toBeVisible();
      await expect(page.locator('.or-table, .or-state h2')).toBeVisible();
    }));
    const requestDetail = page.locator('a[href^="/admin/owner-requests/"]').first();
    if (await requestDetail.count()) routes.push(await measureRoute(records, 'admin-owner-request-detail', () => requestDetail.click(), async () => {
      await expect(page).toHaveURL(/\/admin\/owner-requests\/[^/]+$/);
      await expect(page.locator('.or-detail-head h1')).toBeVisible();
    }));

    routes.push(await measureRoute(records, 'admin-amenities', () => page.locator('a[href="/admin/amenities"]').first().click(), async () => {
      await expect(page).toHaveURL(/\/admin\/amenities$/);
      await expect(page.locator('.aa-heading h1')).toBeVisible();
      await expect(page.locator('.aa-table, .aa-state h2')).toBeVisible();
    }));

    routes.push(await measureRoute(records, 'profile', async () => {
      await page.locator('.fl-profile-trigger').click();
      await page.locator('a[href="/profile"]').click();
    }, async () => {
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.locator('.pr-page h1')).toBeVisible();
    }));

    await page.locator('a[href="/admin/facilities"]').first().click();
    await expect(page.locator('.af-facility-table')).toBeVisible();
    routes.push(await measureRoute(records, 'admin-owner-requests-revisit', () => page.locator('a[href="/admin/owner-requests"]').first().click(), async () => {
      await expect(page.locator('.or-admin-title h1')).toBeVisible();
      await expect(page.getByText('Đang tải yêu cầu…')).toHaveCount(0);
    }));

    await testInfo.attach('admin-end-to-end-performance.json', { body:Buffer.from(JSON.stringify({ routes, records }, null, 2)), contentType:'application/json' });
    console.log('ADMIN_E2E_PERFORMANCE', JSON.stringify(routes.map(route => ({ name:route.name, dataVisibleMs:route.dataVisibleMs, requestCount:route.requestCount, endpointMs:route.requests.map(item => [item.path, item.durationMs]) }))));
    expect(records.filter(item => item.failure && !item.failure.includes('ERR_ABORTED'))).toEqual([]);
    expect(routes.every(route => route.duplicateGets.length === 0)).toBe(true);
    expect(routes.find(route => route.name === 'admin-owner-requests-revisit')?.dataVisibleMs).toBeLessThan(100);
  });
});
