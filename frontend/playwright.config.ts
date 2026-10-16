import { defineConfig } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_EXECUTABLE_PATH'] ??
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : undefined);
const nodeExecutable = `"${process.execPath}"`;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/admin-operations',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4200',
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${nodeExecutable} --import tsx e2e/browser-fixture.ts`,
      cwd: '../backend',
      url: 'http://localhost:3000/api/health',
      env: {
        PORT: '3000',
        FRONTEND_URL: 'http://127.0.0.1:4200',
      },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `${nodeExecutable} node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4200`,
      url: 'http://localhost:4200',
      env: {
        PORT: '4200',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
