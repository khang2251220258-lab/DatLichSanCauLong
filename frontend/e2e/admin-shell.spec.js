import { expect, test } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const credentialsAvailable = Boolean(email && password);

async function login(page) {
  await page.context().clearCookies();
  await page.goto('/admin/facilities');
  await expect(page).toHaveURL(/\/login$/);
  const emailInput = page.getByLabel('Email');
  const passwordInput = page.locator('input[name="password"]');
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/auth/login')),
    page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(),
  ]);
  if (!response.ok()) {
    await emailInput.fill('');
    await passwordInput.fill('');
    throw new Error(`Admin login failed with HTTP ${response.status()}`);
  }
  await expect(page).toHaveURL(/\/admin\/facilities$/);
}

async function assertShell(page, activeName) {
  const navigation = page.getByRole('navigation', { name: 'Điều hướng quản trị' });
  await expect(page.locator('.aw-header')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#admin-workspace')).toBeVisible({ timeout: 20_000 });
  await expect(navigation.getByRole('link')).toHaveCount(3);
  await expect(navigation.getByRole('link', { name: activeName })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.fl-profile-trigger')).toBeVisible();
  await expect(page.locator('.fl-profile-trigger')).toHaveAttribute('aria-haspopup', 'menu');
  const headerStyles = await page.locator('.fl-profile-trigger').evaluate(element => {
    const style = getComputedStyle(element);
    return { display: style.display, borderRadius: style.borderRadius, minHeight: style.minHeight };
  });
  expect(headerStyles.display).toBe('flex');
  expect(parseFloat(headerStyles.borderRadius)).toBeGreaterThan(0);
  expect(parseFloat(headerStyles.minHeight)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const headerBottom = await page.locator('.aw-header').evaluate(element => element.getBoundingClientRect().bottom);
  const workspaceTop = await page.locator('.af-shell').evaluate(element => element.getBoundingClientRect().top);
  expect(workspaceTop).toBeGreaterThanOrEqual(headerBottom - 1);
}

async function assertFacilityList(page, projectName) {
  await expect(page.getByRole('heading', { name: 'Quản lý cơ sở', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Lọc trạng thái' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Cơ sở' })).toBeAttached();
  await expect(table.getByRole('columnheader', { name: 'Trạng thái' })).toBeAttached();
  const firstDetail = page.getByRole('link', { name: 'Xem chi tiết' }).first();
  await expect(firstDetail).toBeVisible();
  const rowDisplay = await table.locator('tbody tr').first().evaluate(element => getComputedStyle(element).display);
  expect(rowDisplay).toBe(projectName === 'admin-desktop' ? 'table-row' : 'grid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function assertOwnerRequestList(page, projectName, listGets) {
  const before = listGets.count;
  await page.goto('/admin/owner-requests');
  await expect(page.getByRole('heading', { name: 'Yêu cầu chủ sân', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Lọc trạng thái' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Chờ duyệt' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => listGets.count).toBe(before + 1);
  if (projectName === 'admin-desktop') {
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Người đăng ký' })).toBeVisible();
    await expect(page.locator('.or-admin-mobile-list')).toBeHidden();
  } else {
    await expect(page.getByRole('list')).toBeVisible();
    await expect(page.locator('.or-admin-table-frame')).toBeHidden();
  }
  const detail = page.getByRole('link', { name: /Xem chi tiết yêu cầu/ }).first();
  await expect(detail).toBeVisible({ timeout: 20_000 });
  await expect(detail).toHaveAttribute('href', /\/admin\/owner-requests\/\d+$/);
  await assertShell(page, 'Yêu cầu chủ sân');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function openFacilityDetailByStatus(page, statusLabel, detailGets) {
  await page.goto('/admin/facilities');
  await assertShell(page, 'Quản lý cơ sở');
  await page.getByRole('button', { name: statusLabel, exact: true }).click();
  await expect(page.getByRole('button', { name: statusLabel, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const detail = page.getByRole('link', { name: 'Xem chi tiết' }).first();
  await expect(detail).toBeVisible();
  const href = await detail.getAttribute('href');
  const apiPath = '/api/v1/admin/facilities/' + href.split('/').at(-1);
  const before = detailGets.get(apiPath) || 0;
  await detail.click();
  await expect(page).toHaveURL(/\/admin\/facilities\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Chi tiết cơ sở', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.af-detail-hero .af-badge')).toHaveText(statusLabel);
  await assertShell(page, 'Quản lý cơ sở');
  await expect.poll(() => detailGets.get(apiPath) || 0).toBe(before + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  return { href, apiPath };
}

async function verifyDirectLoad(page, representative, statusLabel, detailGets) {
  const before = detailGets.get(representative.apiPath) || 0;
  await page.goto(representative.href);
  await expect(page.getByRole('heading', { name: 'Chi tiết cơ sở', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.af-detail-hero .af-badge')).toHaveText(statusLabel);
  await assertShell(page, 'Quản lý cơ sở');
  await expect.poll(() => detailGets.get(representative.apiPath) || 0).toBe(before + 1);
}

test.describe('authenticated Admin workspace shell', () => {
  test.skip(!credentialsAvailable, 'Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD');
  test('navigation, nested active state and responsive layout stay read-only', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = [];
    const detailGets = new Map();
    const ownerRequestListGets = { count: 0 };
    await login(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'GET' && /\/api\/v1\/admin\/facilities\/[^/]+$/.test(pathname)) {
        detailGets.set(pathname, (detailGets.get(pathname) || 0) + 1);
      }
      if (request.method() === 'GET' && pathname === '/api/v1/admin/owner-requests') ownerRequestListGets.count++;
    });
    await page.goto('/admin/facilities');
    await assertShell(page, 'Quản lý cơ sở');
    await assertFacilityList(page, testInfo.project.name);
    const suffix = testInfo.project.name.replace('admin-', '');
    await page.screenshot({ path: `../docs/ui-reference/admin-facilities-${suffix}.png`, fullPage: true });
    const pending = await openFacilityDetailByStatus(page, 'Chờ duyệt', detailGets);
    await verifyDirectLoad(page, pending, 'Chờ duyệt', detailGets);
    await page.screenshot({ path: `../docs/ui-reference/admin-facility-detail-pending-${suffix}.png`, fullPage: true });
    if (testInfo.project.name === 'admin-desktop') {
      await openFacilityDetailByStatus(page, 'Đang hoạt động', detailGets);
      await page.screenshot({ path: '../docs/ui-reference/admin-facility-detail-active-desktop.png', fullPage: true });
      await openFacilityDetailByStatus(page, 'Bị từ chối', detailGets);
      await expect(page.getByRole('heading', { name: 'Lý do từ chối' })).toBeVisible();
      await page.screenshot({ path: '../docs/ui-reference/admin-facility-detail-terminal-desktop.png', fullPage: true });
      await page.getByRole('link', { name: 'Yêu cầu chủ sân' }).click();
      await assertShell(page, 'Yêu cầu chủ sân');
      await page.screenshot({ path: '../docs/ui-reference/admin-shell-owner-requests-desktop.png', fullPage: true });
      await page.getByRole('link', { name: 'Tiện ích' }).click();
      await assertShell(page, 'Tiện ích');
      await page.screenshot({ path: '../docs/ui-reference/admin-shell-amenities-desktop.png', fullPage: true });
      await page.getByRole('link', { name: 'Quản lý cơ sở' }).click();
    }
    await page.goto('/admin/facilities');
    await assertShell(page, 'Quản lý cơ sở');
    await assertFacilityList(page, testInfo.project.name);
    await assertOwnerRequestList(page, testInfo.project.name, ownerRequestListGets);
    const ownerRequestSuffix = testInfo.project.name.replace('admin-', '');
    await page.screenshot({ path: `../docs/ui-reference/admin-owner-requests-${ownerRequestSuffix}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
});
