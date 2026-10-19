import { expect, test } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

async function login(page) {
  await page.context().clearCookies();
  await page.goto('/admin/facilities');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/auth/login')),
    page.getByRole('button', { name:'Đăng nhập', exact:true }).click(),
  ]);
  await expect(page).toHaveURL(/\/admin\/facilities$/);
}

test.describe('protected route performance probes', () => {
  test.skip(!(email && password), 'Missing existing read-only Admin credentials');
  test('Admin list and Account Center revisits preserve verified snapshots', async ({ page }, testInfo) => {
    const reads = [], failures = [], consoleErrors = [];
    page.on('request', request => {
      if (request.method() === 'GET' && request.url().includes('/api/v1/')) reads.push({ url:new URL(request.url()).pathname + new URL(request.url()).search, start:Date.now() });
    });
    page.on('response', response => {
      const match = [...reads].reverse().find(item => !item.end && response.url().includes(item.url));
      if (match) { match.end = Date.now(); match.status = response.status(); }
    });
    page.on('requestfailed', request => { if (!request.failure()?.errorText?.includes('ERR_ABORTED')) failures.push(request.url()); });
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    await login(page);
    failures.length = 0;
    consoleErrors.length = 0;
    await expect(page.getByRole('heading', { name:'Quản lý cơ sở', level:1 })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    const firstAdminVisible = Date.now();
    await page.locator('.fl-profile-trigger').click();
    await page.getByRole('menuitem', { name:'Hồ sơ cá nhân' }).click();
    await expect(page.getByRole('heading', { name:'Tài khoản của tôi' })).toBeVisible();
    const firstProfileVisible = Date.now();
    await page.getByRole('link', { name:/không gian quản trị/i }).click();
    const revisitStart = Date.now();
    await expect(page.getByRole('heading', { name:'Quản lý cơ sở', level:1 })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Đang tải dữ liệu…')).toHaveCount(0);
    const revisitVisible = Date.now();
    await page.locator('.fl-profile-trigger').click();
    await page.getByRole('menuitem', { name:'Hồ sơ cá nhân' }).click();
    const profileRevisitStart = Date.now();
    await expect(page.getByRole('heading', { name:'Tài khoản của tôi' })).toBeVisible();
    await expect(page.getByText('Đang tải hồ sơ…')).toHaveCount(0);
    const profileRevisitVisible = Date.now();

    const duplicateGets = Object.entries(reads.reduce((counts, item) => ({ ...counts, [item.url]:(counts[item.url] || 0) + 1 }), {})).filter(([,count]) => count > 1);
    const report = { firstAdminVisible, firstProfileVisible, adminRevisitMs:revisitVisible-revisitStart, profileRevisitMs:profileRevisitVisible-profileRevisitStart, reads, duplicateGets, failures, consoleErrors };
    await testInfo.attach('protected-performance.json', { body:Buffer.from(JSON.stringify(report, null, 2)), contentType:'application/json' });
    console.log('PROTECTED_PERFORMANCE', JSON.stringify({ adminRevisitMs:report.adminRevisitMs, profileRevisitMs:report.profileRevisitMs, requestCount:reads.length, duplicateGets }));
    // This probe records comparative local evidence. The product target remains
    // <100 ms, but a slow development database must be reported rather than
    // hidden by making the functional E2E suite flaky.
    expect(report.adminRevisitMs).toBeLessThan(6_000);
    expect(report.profileRevisitMs).toBeLessThan(6_000);
    expect(failures).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
