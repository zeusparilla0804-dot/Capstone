import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';

test('rejects an HTML fallback returned for an API health endpoint', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/' || request.url === '/packages' || request.url?.startsWith('/api/health')) {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>SPA fallback</title>');
      return;
    }

    if (request.url === '/api/bookings/my' || request.url === '/api/admin/dashboard') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ success: false }));
      return;
    }

    if (request.url === '/api/auth/login') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ success: false }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ success: false }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, 'object');

    const child = spawn(process.execPath, ['scripts/staging-smoke.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        ALLOW_HTTP_SMOKE: 'true',
        STAGING_BASE_URL: `http://127.0.0.1:${address.port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });

    const [exitCode] = await once(child, 'exit');
    assert.equal(exitCode, 1);
    assert.match(stderr, /\/api\/health.*application\/json/i);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
