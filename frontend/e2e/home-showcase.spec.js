import { expect, test } from '@playwright/test';

test('Home is search-first, owns the shared Footer layout, avoids pre-submit Facility requests, and stays responsive', async ({ page }, testInfo) => {
  const consoleErrors = [];
  const facilityRequests = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('401')) consoleErrors.push(message.text());
  });
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/session')) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SESSION_EXPIRED' } }) });
      return;
    }
    if (url.pathname.endsWith('/facilities')) {
      facilityRequests.push({ method: route.request().method(), search: url.search });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { page: 1, page_size: 20, total: 0, server_time: '2026-10-21T00:00:00Z' } }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND' } }) });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Tìm sân cầu lông/i })).toBeVisible();
  await expect(page.getByLabel('Tên sân hoặc cơ sở')).toBeVisible();
  await expect(page.getByLabel('Khu vực', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Ngày chơi')).toBeVisible();
  await expect(page.getByLabel('Giờ bắt đầu')).toBeVisible();
  await expect(page.getByLabel('Giờ kết thúc')).toBeVisible();
  await expect(page.locator('.home-facilities')).toHaveCount(0);
  expect(facilityRequests).toHaveLength(0);

  const searchLayout = await page.locator('.home-search-fields').evaluate(fields =>
    getComputedStyle(fields).gridTemplateColumns.trim().split(/\s+/).length,
  );
  const isMobile = testInfo.project.name === 'home-showcase-mobile';
  const isTablet = testInfo.project.name === 'home-showcase-tablet';
  expect(searchLayout).toBe(isMobile ? 1 : isTablet ? 2 : 6);
  await expect(page.getByRole('link', { name: 'Phường Hải Châu' })).toHaveAttribute('href', /\/facilities\?district=/);

  const footerLayout = await page.locator('.fl-footer').evaluate(footer => {
    const grid = footer.querySelector('.fl-footer-grid');
    const bottom = footer.querySelector('.fl-footer-bottom');
    return {
      gridDisplay: getComputedStyle(grid).display,
      columnCount: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length,
      bottomDirection: getComputedStyle(bottom).flexDirection,
    };
  });
  expect(footerLayout.gridDisplay).toBe('grid');
  expect(footerLayout.columnCount).toBe(isMobile ? 1 : isTablet ? 2 : 4);
  expect(footerLayout.bottomDirection).toBe(isMobile ? 'column' : 'row');

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);

  await page.getByLabel('Tên sân hoặc cơ sở').fill('Sân demo');
  await page.getByLabel('Khu vực', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Tìm sân' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/facilities' && url.searchParams.get('q') === 'Sân demo');
  await expect(page.getByRole('heading', { name: /Danh sách sân|Sân phù hợp với thời gian đã chọn/ })).toBeVisible();
  await expect.poll(() => facilityRequests.length).toBe(1);
  expect(facilityRequests).toHaveLength(1);
  expect(facilityRequests[0].method).toBe('GET');
  expect(facilityRequests[0].search).toContain('date=');
  expect(facilityRequests[0].search).toContain('start_time=18%3A00');
  expect(facilityRequests[0].search).toContain('end_time=19%3A00');
  expect(consoleErrors).toEqual([]);
});
