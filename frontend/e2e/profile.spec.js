import { expect, test } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const credentialsAvailable = Boolean(email && password);

test.describe('shared Profile read-only runtime', () => {
  test.skip(!credentialsAvailable, 'Missing safe local E2E credentials');
  test('Admin can read Profile at desktop/tablet/mobile without mutation', async ({ page }, testInfo) => {
    await page.context().clearCookies();
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(email);
    await page.locator('input[name="password"]').fill(password);
    const loginResponse = page.waitForResponse(response => response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    expect((await loginResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Tài khoản của tôi', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Họ và tên')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Số điện thoại')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    await expect(page.locator('input#current-password')).toBeVisible();
    await page.locator('input#current-password').fill('x');
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByText('Mật khẩu từ 8–128 ký tự, gồm ít nhất một chữ cái và một chữ số.').first()).toBeVisible();
    const accountTrigger = page.getByRole('button', { name: /Demo Admin Reviewer/ });
    await accountTrigger.click();
    await expect(page.getByRole('menuitem', { name: 'Hồ sơ cá nhân' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    const suffix = testInfo.project.name.replace('profile-', '');
    await page.screenshot({ path: `../docs/ui-reference/account-center-${suffix}.png`, fullPage: true });
    if (suffix === 'desktop') {
      await page.screenshot({ path: '../docs/ui-reference/account-menu-desktop.png' });
      await accountTrigger.click();
      await page.locator('#security').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '../docs/ui-reference/security-section-desktop.png' });
    }
  });
});
