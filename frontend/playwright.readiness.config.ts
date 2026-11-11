import { defineConfig } from '@playwright/test';

// Uses the already-running local frontend. All API responses are mocked by the tests.
export default defineConfig({
  testDir: './e2e', testMatch: 'public-readiness.spec.ts', workers: 1,
  outputDir: 'test-results/readiness', timeout: 30_000,
  use: {
    baseURL: process.env['PUBLIC_QA_URL'] ?? 'http://localhost:4200',
    launchOptions: process.platform === 'win32'
      ? { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' } : {},
  },
});
