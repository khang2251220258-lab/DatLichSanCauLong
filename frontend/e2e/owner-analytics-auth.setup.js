import { expect, test as setup } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixturePath = fileURLToPath(new URL('../playwright/.auth/owner-analytics-fixture.json', import.meta.url));
const statePath = fileURLToPath(new URL('../playwright/.auth/owner-analytics-state.json', import.meta.url));
const fixtureAvailable = existsSync(fixturePath);
const fixture = fixtureAvailable ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;

setup('authenticate isolated Analytics Owner through the real Login UI', async ({ page }) => {
  setup.skip(!fixtureAvailable, 'Run the isolated Owner Analytics fixture setup first.');
  const started = Date.now();
  await page.goto('/login');
  await page.getByLabel('Email').fill(fixture.email);
  await page.locator('input[name="password"]').fill(fixture.password);
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/auth/login')),
    page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'TEST_E2E_OWNER_ANALYTICS_PHASE_4_OWNER' })).toBeVisible();
  await page.context().storageState({ path: statePath });
  console.log('OWNER_ANALYTICS_AUTH_RUNTIME', JSON.stringify({ login_to_authenticated_ms: Date.now() - started }));
});
