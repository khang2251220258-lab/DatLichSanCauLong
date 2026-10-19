import { expect, test } from '@playwright/test';

test('public SPA navigation has bounded API reads and stable loading states', async ({ page }, testInfo) => {
  const requests = [];
  page.on('request', request => {
    if (request.method() === 'GET' && request.url().includes('/api/v1/')) requests.push(new URL(request.url()).pathname + new URL(request.url()).search);
  });
  await page.addInitScript(() => {
    window.__localPerf = { lcp:0, cls:0 };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__localPerf.lcp = entry.startTime; }).observe({ type:'largest-contentful-paint', buffered:true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__localPerf.cls += entry.value; }).observe({ type:'layout-shift', buffered:true });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level:1 })).toBeVisible();
  await page.getByRole('navigation', { name:'Điều hướng chính' }).getByRole('link', { name:'Tìm sân', exact:true }).click();
  await expect(page).toHaveURL(/\/facilities(?:\?|$)/);
  await expect(page.getByRole('heading', { level:1 })).toBeVisible();
  await page.getByRole('navigation', { name:'Điều hướng chính' }).getByRole('link', { name:'Trang chủ', exact:true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level:1 })).toBeVisible();

  const sessionReads = requests.filter(path => path === '/api/v1/auth/session');
  const listReads = requests.filter(path => path.startsWith('/api/v1/facilities'));
  expect(sessionReads).toHaveLength(1);
  expect(listReads.length).toBeLessThanOrEqual(3);
  await expect(page.getByText('Đang tải danh sách sân…')).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp:fcp?.startTime ?? null, lcp:window.__localPerf.lcp, cls:window.__localPerf.cls, domContentLoaded:navigation?.domContentLoadedEventEnd ?? null, resources:performance.getEntriesByType('resource').length };
  });
  console.log('PUBLIC_PERFORMANCE', JSON.stringify({ metrics, requestCount:requests.length, requests }));
  await testInfo.attach('local-performance.json', { body:Buffer.from(JSON.stringify({ metrics, requests }, null, 2)), contentType:'application/json' });
});
