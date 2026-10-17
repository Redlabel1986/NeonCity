import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  workers: 2,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Online world for tests/e2e/online.spec.ts: a fresh data directory per run, small city, 1× speed.
      command: 'npx tsx server/main.ts',
      url: 'http://localhost:8787/api/status',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PORT: '8787', NEON_DATA: `test-results/online-${Date.now()}`, NEON_CITY_SIZE: '48', NEON_SPEED: '1', NEON_SEED: 'e2e-online' },
    },
  ],
});
