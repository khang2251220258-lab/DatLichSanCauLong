import { expect as baseExpect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixturePath = fileURLToPath(new URL('../playwright/.auth/release-fixture.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const backendRoot = fileURLToPath(new URL('../../backend/', import.meta.url));
const fixtureScript = fileURLToPath(new URL('../../backend/scripts/e2e-release-fixture.js', import.meta.url));
const screenshot = name => fileURLToPath(new URL(`../../docs/ui-reference/${name}`, import.meta.url));
const apiBase = process.env.VITE_API_BASE_URL;
const expect = baseExpect.configure({ timeout: 30_000 });

function recordFixture(kind, id) {
  const result = spawnSync(process.execPath, [fixtureScript, 'record', kind, String(id)], {
    cwd: backendRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`FIXTURE_RECORD_FAILED_${kind}: ${result.stderr.trim()}`);
}

function monitor(page) {
  const requests = [], active = new Map(), consoleErrors = [], pageErrors = [], failed = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) return;
    const row = { method: request.method(), path: url.pathname, query: url.search, started_at: Date.now(), duration_ms: null, status: null };
    requests.push(row); active.set(request, row);
  });
  page.on('response', response => {
    const row = active.get(response.request());
    if (!row) return;
    row.duration_ms = Date.now() - row.started_at;
    row.status = response.status();
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/')) failed.push({ path: url.pathname, error: request.failure()?.errorText });
  });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  return { requests, consoleErrors, pageErrors, failed };
}

const rows = (events, method, path) => events.requests.filter(row => row.method === method && row.path === path);

async function login(page, identity, expectedPath) {
  const started = Date.now();
  await page.goto('/login');
  await page.getByLabel('Email').fill(identity.email);
  await page.locator('input[name="password"]').fill(identity.password);
  const response = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await page.waitForURL(url => url.pathname === expectedPath, { timeout: 30_000 });
  await expect(page.locator('.fl-profile-trigger')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toHaveCount(0);
  return Date.now() - started;
}

async function logout(page) {
  await page.locator('.fl-profile-trigger').click();
  const response = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/v1/auth/logout');
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
  expect((await response).ok()).toBeTruthy();
  await page.waitForURL(url => url.pathname === '/login');
  await expect(page.locator('.fl-profile-trigger')).toHaveCount(0);
}

async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
}

async function expectSingleH1(page) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
}

async function viewportCheck(page, width, height) {
  await page.setViewportSize({ width, height });
  await expectNoOverflow(page);
  await expectSingleH1(page);
}

test('full authenticated release rehearsal uses isolated fixtures and real UI', async ({ page }) => {
  test.setTimeout(12 * 60_000);
  expect(apiBase).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
  const events = monitor(page);
  const timings = {};
  const ids = {};

  await page.goto('/bookings');
  await page.waitForURL(url => url.pathname === '/login');
  timings.customer_login_ms = await login(page, fixture.credentials.customer, '/bookings');
  await expect(page.getByRole('heading', { name: 'Lịch đặt sân', exact: true })).toBeVisible();

  await page.goto('/owner/bookings');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  await page.goto('/admin/facilities');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Đặt sân cầu lông/ })).toBeVisible();
  await expect(page.locator('.fl-profile-trigger')).toBeVisible();
  await expect(page.locator('.home-facilities [aria-busy="false"]')).toBeVisible();
  await page.screenshot({ path: screenshot('release-home-desktop.png'), fullPage: true });
  await expectNoOverflow(page);

  const searchStarted = Date.now();
  await page.goto('/facilities');
  await page.getByLabel('Tên sân').fill(fixture.names.facility);
  await page.getByLabel('Ngày chơi').fill(fixture.single.date);
  await page.getByLabel('Giờ bắt đầu').selectOption(fixture.single.start_time);
  await page.getByLabel('Giờ kết thúc').selectOption(fixture.single.end_time);
  const searchResponse = page.waitForResponse(item => item.request().method() === 'GET' && new URL(item.url()).pathname === '/api/v1/facilities' && new URL(item.url()).searchParams.get('q') === fixture.names.facility);
  await page.getByRole('button', { name: /Tìm kiếm/ }).click();
  expect((await searchResponse).ok()).toBeTruthy();
  const facilityCard = page.locator('article.fl-card').filter({ hasText: fixture.names.facility });
  await expect(facilityCard).toBeVisible();
  timings.search_data_visible_ms = Date.now() - searchStarted;
  await facilityCard.getByRole('link', { name: /Xem chi tiết/ }).click();
  await expect(page.getByRole('heading', { name: fixture.names.facility, level: 1 })).toBeVisible();
  await expect(page.getByText(fixture.names.court, { exact: true })).toBeVisible();
  const continueButton = page.getByRole('button', { name: /Tiếp tục đặt sân/ });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByRole('heading', { name: 'Xác nhận đặt sân' })).toBeVisible();

  const bookingPostBefore = rows(events, 'POST', '/api/v1/bookings').length;
  const createStarted = Date.now();
  const createResponsePromise = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === '/api/v1/bookings');
  await page.getByRole('button', { name: 'Xác nhận đặt sân', exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json();
  ids.booking = String(createBody.data.id);
  expect(createBody.data.booking_flow_version).toBe(2);
  expect(createBody.data.status).toBe('PENDING_CONFIRMATION');
  recordFixture('booking', ids.booking);
  await page.waitForURL(url => url.pathname === `/bookings/${ids.booking}/payment`);
  await expect(page.getByRole('heading', { name: 'Hướng dẫn chuyển tiền cọc' })).toBeVisible();
  await expect(page.getByText(`CLDN ${ids.booking}`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Không cần tải ảnh minh chứng/)).toBeVisible();
  expect(rows(events, 'POST', '/api/v1/bookings')).toHaveLength(bookingPostBefore + 1);
  timings.booking_create_ms = Date.now() - createStarted;

  await viewportCheck(page, 768, 1024);
  await viewportCheck(page, 390, 844);
  await page.setViewportSize({ width: 1440, height: 900 });

  await logout(page);
  timings.owner_login_ms = await login(page, fixture.credentials.owner, '/owner/facilities');
  await expect(page.getByText(fixture.names.customer)).toHaveCount(0);
  await page.goto('/admin/amenities');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  const crossOwner = await page.request.get(`${apiBase}/owner/facilities/${fixture.ids.other_facility}`);
  expect(crossOwner.status()).toBe(404);

  await page.goto('/owner/bookings');
  await expect(page.getByRole('heading', { name: 'Quản lý đặt sân' })).toBeVisible();
  await expect(page.getByText(`BOOKING #${ids.booking}`)).toBeVisible();
  await page.screenshot({ path: screenshot('release-owner-bookings-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: `Xem chi tiết booking ${ids.booking}` }).click();
  await expect(page.getByRole('heading', { name: 'Chi tiết đặt sân' })).toBeVisible();
  const openConfirm = page.getByRole('button', { name: 'Xác nhận đặt sân', exact: true });
  await openConfirm.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(openConfirm).toBeFocused();
  await openConfirm.click();
  const confirmPath = `/api/v1/owner/bookings/${ids.booking}/confirm`;
  const detailPath = `/api/v1/owner/bookings/${ids.booking}`;
  const confirmBefore = rows(events, 'POST', confirmPath).length;
  const detailReadsBefore = rows(events, 'GET', detailPath).length;
  const confirmStarted = Date.now();
  const confirmResponsePromise = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === confirmPath);
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận đặt sân', exact: true }).click();
  expect((await confirmResponsePromise).ok()).toBeTruthy();
  await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
  expect(rows(events, 'POST', confirmPath)).toHaveLength(confirmBefore + 1);
  await expect.poll(() => rows(events, 'GET', detailPath).length).toBeGreaterThan(detailReadsBefore);
  timings.owner_confirm_ms = Date.now() - confirmStarted;

  await page.goto('/owner/bookings');
  await page.getByRole('link', { name: 'Cơ sở của tôi' }).click();
  await expect(page).toHaveURL(/\/owner\/facilities/);
  await page.goBack();
  await expect(page).toHaveURL(/\/owner\/bookings/);
  await page.goForward();
  await expect(page).toHaveURL(/\/owner\/facilities/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cơ sở của tôi' })).toBeVisible();

  await logout(page);
  await login(page, fixture.credentials.customer, '/');
  await expect(page.getByText(fixture.names.owner)).toHaveCount(0);
  await page.goto(`/bookings/${ids.booking}`);
  await expect(page.getByRole('heading', { name: 'Chi tiết đặt sân' })).toBeVisible();
  await expect(page.getByText(/Số tiền còn lại 70% thanh toán tại sân/)).toBeVisible();
  await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: screenshot('release-customer-booking-desktop.png'), fullPage: true });
  await viewportCheck(page, 768, 1024);
  await viewportCheck(page, 390, 844);
  await page.screenshot({ path: screenshot('release-customer-booking-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  const recurringStarted = Date.now();
  await page.goto('/facilities?mode=recurring');
  await page.getByLabel('Thứ trong tuần').selectOption(String(fixture.recurring.weekday));
  await page.getByLabel('Ngày bắt đầu').fill(fixture.recurring.start_date);
  await page.getByLabel('Ngày kết thúc').fill(fixture.recurring.end_date);
  await page.getByLabel('Giờ bắt đầu').selectOption(fixture.recurring.start_time);
  await page.getByLabel('Giờ kết thúc').selectOption(fixture.recurring.end_time);
  const recurringSearch = page.waitForResponse(item => item.request().method() === 'GET' && new URL(item.url()).pathname === '/api/v1/facilities/recurring-search');
  await page.getByRole('button', { name: /Tìm sân phù hợp/ }).click();
  expect((await recurringSearch).ok()).toBeTruthy();
  const recurringCard = page.locator('article.fl-card').filter({ hasText: fixture.names.facility });
  await expect(recurringCard).toBeVisible();
  await recurringCard.getByRole('button', { name: 'Chọn lịch cố định' }).click();
  await expect(page.getByRole('heading', { name: 'Xác nhận lịch cố định' })).toBeVisible();
  const seriesPath = '/api/v1/bookings/recurring';
  const seriesBefore = rows(events, 'POST', seriesPath).length;
  const seriesResponsePromise = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === seriesPath);
  await page.getByRole('button', { name: 'Đặt lịch cố định' }).click();
  const seriesResponse = await seriesResponsePromise;
  expect(seriesResponse.ok()).toBeTruthy();
  const seriesBody = await seriesResponse.json();
  ids.series = String(seriesBody.data.id);
  expect(seriesBody.data.status).toBe('PENDING_CONFIRMATION');
  recordFixture('series', ids.series);
  await page.waitForURL(url => url.pathname === `/booking-series/${ids.series}`);
  await expect(page.getByRole('heading', { name: 'Chi tiết lịch đặt cố định' })).toBeVisible();
  await expect(page.getByText(new RegExp(`CLDNS\\s+${ids.series}`)).first()).toBeVisible();
  await expect(page.getByText(/không sử dụng upload minh chứng thanh toán/i)).toBeVisible();
  expect(rows(events, 'POST', seriesPath)).toHaveLength(seriesBefore + 1);
  timings.recurring_create_ms = Date.now() - recurringStarted;
  await page.screenshot({ path: screenshot('release-recurring-customer-desktop.png'), fullPage: true });

  await logout(page);
  await login(page, fixture.credentials.owner, '/owner/facilities');
  await page.goto(`/owner/booking-series/${ids.series}`);
  await expect(page.getByRole('heading', { name: 'Chi tiết lịch đặt cố định' })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const seriesConfirmPath = `/api/v1/owner/booking-series/${ids.series}/confirm`;
  const seriesConfirmBefore = rows(events, 'POST', seriesConfirmPath).length;
  const seriesDetailPath = `/api/v1/owner/booking-series/${ids.series}`;
  const seriesReadBefore = rows(events, 'GET', seriesDetailPath).length;
  const seriesConfirm = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === seriesConfirmPath);
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận lịch' }).click();
  expect((await seriesConfirm).ok()).toBeTruthy();
  await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
  expect(rows(events, 'POST', seriesConfirmPath)).toHaveLength(seriesConfirmBefore + 1);
  await expect.poll(() => rows(events, 'GET', seriesDetailPath).length).toBeGreaterThan(seriesReadBefore);

  const analyticsOverview = '/api/v1/owner/analytics/overview';
  const analyticsCourts = '/api/v1/owner/analytics/courts';
  const overviewBefore = rows(events, 'GET', analyticsOverview).length;
  const courtsBefore = rows(events, 'GET', analyticsCourts).length;
  const analyticsStarted = Date.now();
  await page.goto(`/owner/analytics?from=${fixture.single.date}&to=${fixture.recurring.end_date}&facility_id=${fixture.ids.facility}`);
  await expect(page.getByRole('heading', { name: 'Thống kê hoạt động' })).toBeVisible();
  await expect(page.getByLabel('Chỉ số tổng quan')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Hiệu suất từng sân' })).toBeVisible();
  await expect(page.getByText(fixture.names.court, { exact: true })).toBeVisible();
  expect(rows(events, 'GET', analyticsOverview)).toHaveLength(overviewBefore + 1);
  expect(rows(events, 'GET', analyticsCourts)).toHaveLength(courtsBefore + 1);
  timings.analytics_data_visible_ms = Date.now() - analyticsStarted;
  await page.screenshot({ path: screenshot('release-owner-analytics-desktop.png'), fullPage: true });
  await viewportCheck(page, 768, 1024);
  await viewportCheck(page, 390, 844);
  await page.screenshot({ path: screenshot('release-owner-analytics-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await logout(page);
  await login(page, fixture.credentials.customer, '/');
  await page.goto(`/booking-series/${ids.series}`);
  await expect(page.getByText('Đã xác nhận', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.rc-occurrence-action').getByText('Đã xác nhận', { exact: true })).toHaveCount(fixture.recurring.occurrence_count);

  await logout(page);
  timings.admin_login_ms = await login(page, fixture.credentials.admin, '/admin/facilities');
  await expect(page.getByRole('heading', { name: 'Quản lý cơ sở' })).toBeVisible();
  await page.getByRole('link', { name: 'Yêu cầu chủ sân' }).click();
  await expect(page).toHaveURL(/\/admin\/owner-requests/);
  await expectSingleH1(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/facilities/);
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/owner-requests/);
  await page.reload();
  await expectSingleH1(page);
  await page.getByRole('link', { name: 'Tiện ích' }).click();
  await expect(page.getByRole('heading', { name: 'Quản lý tiện ích' })).toBeVisible();
  const amenityPath = '/api/v1/admin/amenities';
  const amenityBefore = rows(events, 'POST', amenityPath).length;
  await page.getByRole('button', { name: /Thêm tiện ích/ }).click();
  await page.getByLabel('Tên tiện ích').fill(fixture.names.amenity);
  const amenityResponsePromise = page.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === amenityPath);
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm tiện ích', exact: true }).click();
  const amenityResponse = await amenityResponsePromise;
  expect(amenityResponse.ok()).toBeTruthy();
  const amenityBody = await amenityResponse.json();
  ids.amenity = String(amenityBody.data.id);
  recordFixture('amenity', ids.amenity);
  expect(rows(events, 'POST', amenityPath)).toHaveLength(amenityBefore + 1);
  await expect(page.getByText('Đã thêm tiện ích.')).toBeVisible();
  await page.screenshot({ path: screenshot('release-admin-desktop.png'), fullPage: true });
  await viewportCheck(page, 768, 1024);
  await viewportCheck(page, 390, 844);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/owner/bookings');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();

  const criticalPosts = [
    ['/api/v1/bookings', 1],
    [confirmPath, 1],
    [seriesPath, 1],
    [seriesConfirmPath, 1],
    [amenityPath, 1],
  ];
  for (const [path, count] of criticalPosts) expect(rows(events, 'POST', path)).toHaveLength(count);
  expect(events.requests.filter(row => row.path.includes('/payments/') || row.path.includes('/proof'))).toHaveLength(0);
  expect(events.requests.filter(row => (row.status ?? 0) >= 500)).toHaveLength(0);
  const expectedClientErrors = new Set(['/api/v1/auth/session:401', `/api/v1/owner/facilities/${fixture.ids.other_facility}:404`]);
  const unexpectedClientErrors = events.requests.filter(row => row.status >= 400 && row.status < 500 && !expectedClientErrors.has(`${row.path}:${row.status}`));
  expect(unexpectedClientErrors).toEqual([]);
  expect(events.failed.filter(row => row.error !== 'net::ERR_ABORTED')).toEqual([]);
  const sessionUnauthorizedCount = rows(events, 'GET', '/api/v1/auth/session').filter(row => row.status === 401).length;
  const unauthorizedConsoleMessage = 'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
  const expectedUnauthorizedConsoleErrors = events.consoleErrors.filter(message => message === unauthorizedConsoleMessage);
  const unexpectedConsoleErrors = events.consoleErrors.filter(message => message !== unauthorizedConsoleMessage);
  expect(expectedUnauthorizedConsoleErrors).toHaveLength(sessionUnauthorizedCount);
  expect(unexpectedConsoleErrors).toEqual([]);
  expect(events.pageErrors).toEqual([]);

  console.log('RELEASE_REHEARSAL_EVIDENCE', JSON.stringify({
    ids,
    timings,
    critical_requests: Object.fromEntries(criticalPosts.map(([path]) => [path, rows(events, 'POST', path).length])),
    analytics_initial_requests: { overview: rows(events, 'GET', analyticsOverview).length - overviewBefore, courts: rows(events, 'GET', analyticsCourts).length - courtsBefore },
    api_request_count: events.requests.length,
    api_failures: events.failed.length,
    expected_session_401_console_messages: expectedUnauthorizedConsoleErrors.length,
    unexpected_console_errors: unexpectedConsoleErrors.length,
    page_errors: events.pageErrors.length,
  }));
});
