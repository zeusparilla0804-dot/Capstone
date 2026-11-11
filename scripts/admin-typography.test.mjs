import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin portal uses IBM Plex Sans while preserving the customer and brand typography', async () => {
  const [index, shell, sidebar, login, dashboard, reports, statusBadge, globalStyles, tokens] =
    await Promise.all([
    read('frontend/src/index.html'),
    read('frontend/src/app/shared/components/admin-shell/admin-shell.scss'),
    read('frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.scss'),
    read('frontend/src/app/features/admin-login/admin-login.page.scss'),
    read('frontend/src/app/features/admin-dashboard/admin-dashboard.page.scss'),
    read('frontend/src/app/features/admin-reports/admin-reports.page.scss'),
    read('frontend/src/app/shared/components/status-badge/status-badge.scss'),
    read('frontend/src/styles.scss'),
    read('frontend/src/styles/_tokens.scss'),
  ]);

  assert.match(index, /family=IBM\+Plex\+Sans:wght@400;500;600;700/);
  assert.match(
    globalStyles,
    /--font-admin:\s*'IBM Plex Sans',\s*'Segoe UI',\s*sans-serif;/,
  );
  assert.match(globalStyles, /--font-brand:\s*var\(--font-serif\);/);
  assert.match(
    shell,
    /\.admin-layout\s*{[^}]*--font-serif:\s*var\(--font-admin\);[^}]*font-family:\s*var\(--font-admin\);/,
  );
  assert.match(
    shell,
    /\.admin-page-header h1\s*{[^}]*font-family:\s*var\(--font-admin\);[^}]*font-weight:\s*600;[^}]*letter-spacing:\s*-0\.025em;/,
  );
  // The sign-in screen deliberately uses public brand typography; the admin workspace uses IBM Plex Sans.
  assert.match(login, /\.admin-login\s*{[^}]*font-family:\s*var\(--font-sans\);/);
  assert.match(login, /\.admin-form-panel h1\s*{[^}]*font-family:\s*var\(--font-serif\);/);
  assert.match(
    dashboard,
    /\.priority-grid strong\s*{[^}]*font-family:\s*var\(--font-admin\);[^}]*font-weight:\s*600;/,
  );
  assert.match(
    reports,
    /\.report-summary dd\s*{[^}]*font-family:\s*var\(--font-admin\);[^}]*font-weight:\s*600;/,
  );
  assert.match(
    sidebar,
    /\.dashboard-sidebar__brand,[\s\S]*?font-family:\s*var\(--font-brand\);/,
  );
  assert.match(globalStyles, /\.admin-table th\s*{[^}]*font-weight:\s*600;/);
  assert.match(globalStyles, /\.admin-table td\s*{[^}]*font-weight:\s*500;/);
  assert.match(statusBadge, /font-weight:\s*var\(--status-font-weight,\s*700\);/);
  assert.match(tokens, /\$font-family-sans:\s*'Manrope',\s*'Segoe UI',\s*sans-serif;/);
});
