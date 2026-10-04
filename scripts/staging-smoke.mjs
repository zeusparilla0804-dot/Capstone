const baseUrl = process.env.STAGING_BASE_URL?.replace(/\/$/, '');
if (!baseUrl) throw new Error('STAGING_BASE_URL is required, for example https://staging.example.com');

async function check(path, expected, options) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options });
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${path}: expected ${expected}, received ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log(`PASS ${expected} ${path}`);
}

if (!baseUrl.startsWith('https://') && process.env.ALLOW_HTTP_SMOKE !== 'true') {
  throw new Error('Staging smoke tests require HTTPS. Set ALLOW_HTTP_SMOKE=true only for local proxy verification.');
}

await check('/', 200);
await check('/packages', 200);
await check('/api/health', 200);
await check('/api/health/ready', 200);
await check('/api/bookings/my', 401);
await check('/api/admin/dashboard', 401);
await check('/api/not-a-route', 404);
await check('/api/auth/login', 400, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'invalid', password: '' })
});

console.log('Staging smoke checks passed.');
