import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const reference = name => resolve('../docs/ui-reference', name);

test('Home Facility showcase is responsive, read-only and uses one list request', async ({ page }, testInfo) => {
  const consoleErrors = [];
  const unexpectedResponses = [];
  const facilityRequests = [];
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) consoleErrors.push(message.text());
  });
  page.on('response', response => {
    const url = new URL(response.url());
    const expectedGuestSession = url.pathname.endsWith('/auth/session') && response.status() === 401;
    if (response.status() >= 400 && !expectedGuestSession) unexpectedResponses.push(`${response.status()} ${url.pathname}`);
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.includes('/facilities')) facilityRequests.push({ method: request.method(), pathname: url.pathname, search: url.search });
  });

  await page.goto('/');
  const section = page.locator('.home-facilities');
  await expect(section.getByRole('heading', { name: 'Sân cầu lông tại Đà Nẵng' })).toBeVisible();
  await expect(section.locator('.fl-card-home').first()).toBeVisible();
  await expect(section.getByRole('link', { name: 'Xem sân' }).first()).toBeVisible();
  await expect(section.getByRole('link', { name: /Xem tất cả/ })).toHaveAttribute('href', '/facilities');
  await page.waitForFunction(() => [...document.images].every(image => image.complete));

  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  const listRequests = facilityRequests.filter(request => request.method === 'GET' && /\/facilities$/.test(request.pathname));
  const detailRequestsBeforeNavigation = facilityRequests.filter(request => /\/facilities\/\d+$/.test(request.pathname));
  expect(listRequests).toHaveLength(1);
  expect(listRequests[0].search).toContain('page_size=4');
  expect(detailRequestsBeforeNavigation).toHaveLength(0);

  const screenshot = {
    'home-showcase-desktop': 'home-facilities-desktop.png',
    'home-showcase-tablet': 'home-facilities-tablet.png',
    'home-showcase-mobile': 'home-facilities-mobile.png',
  }[testInfo.project.name];
  await section.screenshot({ path: reference(screenshot) });

  await section.getByRole('link', { name: 'Xem sân' }).first().click();
  await expect(page).toHaveURL(/\/facilities\/\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(unexpectedResponses).toEqual([]);
});
