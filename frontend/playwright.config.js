// @ts-check
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const localEnvPath = fileURLToPath(new URL('./.env.local', import.meta.url));
if (existsSync(localEnvPath)) loadEnvFile(localEnvPath);

// Keep the default origin aligned with backend FRONTEND_URL/CORS and session cookies.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const webServerPort = new URL(baseURL).port || (baseURL.startsWith('https:') ? '443' : '80');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Keep local authenticated projects sequential: three browsers plus Vite can
  // exhaust constrained Windows runners and produce false navigation failures.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testMatch: /public-(?:smoke|performance)\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'guest-search-desktop', testMatch: /guest-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'guest-search-tablet', testMatch: /guest-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'guest-search-mobile', testMatch: /guest-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'home-showcase-desktop', testMatch: /home-showcase\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'home-showcase-tablet', testMatch: /home-showcase\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'home-showcase-mobile', testMatch: /home-showcase\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-desktop', testMatch: /recurring-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-tablet', testMatch: /recurring-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-mobile', testMatch: /recurring-search\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-customer-auth-setup', testMatch: /recurring-customer-auth\.setup\.js/, use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-customer-desktop', dependencies: ['recurring-customer-auth-setup'], testMatch: /recurring-customer-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/recurring-customer-state.json', viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-customer-tablet', dependencies: ['recurring-customer-auth-setup'], testMatch: /recurring-customer-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/recurring-customer-state.json', viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'recurring-customer-mobile', dependencies: ['recurring-customer-auth-setup'], testMatch: /recurring-customer-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/recurring-customer-state.json', viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'owner-analytics-auth-setup', testMatch: /owner-analytics-auth\.setup\.js/, use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'owner-analytics-desktop', dependencies: ['owner-analytics-auth-setup'], testMatch: /owner-analytics-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/owner-analytics-state.json', viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'owner-analytics-tablet', dependencies: ['owner-analytics-auth-setup'], testMatch: /owner-analytics-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/owner-analytics-state.json', viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'owner-analytics-mobile', dependencies: ['owner-analytics-auth-setup'], testMatch: /owner-analytics-auth\.spec\.js/, use: { ...devices['Desktop Chrome'], storageState: './playwright/.auth/owner-analytics-state.json', viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'firefox', testMatch: /public-smoke\.spec\.js/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: /public-smoke\.spec\.js/, use: { ...devices['Desktop Safari'] } },
    { name: 'admin-desktop', testMatch: /admin-shell\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'admin-tablet', testMatch: /admin-shell\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'admin-mobile', testMatch: /admin-shell\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'profile-desktop', testMatch: /profile\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'profile-tablet', testMatch: /profile\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'profile-mobile', testMatch: /profile\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'protected-performance', testMatch: /protected-performance\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'end-to-end-performance', testMatch: /end-to-end-performance\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'off', video: 'off' } },
    { name: 'release-rehearsal', testMatch: /release-rehearsal\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, screenshot: 'off', trace: 'retain-on-failure', video: 'retain-on-failure' } },
  ],
  webServer: {
    command: `npm run dev -- --host 0.0.0.0 --port ${webServerPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === 'true' || (!process.env.CI && !process.env.E2E_BASE_URL),
    timeout: 120_000,
  },
});
