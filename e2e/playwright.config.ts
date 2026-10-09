import { defineConfig, devices } from '@playwright/test';
import { API_PORT, databaseUrl, WEB_PORT } from './env';

const apiUrl = `http://127.0.0.1:${API_PORT}`;
const webUrl = `http://127.0.0.1:${WEB_PORT}`;

// In CI Playwright installs its own Chromium. Locally you can point at an installed one:
//   PW_CHROMIUM_PATH=/path/to/chrome npm run e2e
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : {},
  },
  webServer: [
    {
      command: 'npx tsx ../e2e/prepare-db.ts && npx tsx src/server.ts',
      cwd: '../api',
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl(),
        PUBLIC_URL: webUrl,
        ADMIN_PASSWORD: 'e2e-admin-password',
        SESSION_SECRET: 'e2e-session-secret-0123456789abcdef',
        PRO_ENABLED: 'true',
        REMINDERS_ENABLED: 'false',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      cwd: '../web',
      url: webUrl,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...(process.env as Record<string, string>), VITE_API_TARGET: apiUrl },
    },
  ],
});
