const baseUrl = process.env.STAGING_BASE_URL?.replace(/\/$/, '');
if (!baseUrl) throw new Error('STAGING_BASE_URL is required, for example https://staging.example.com');

async function check(path, expected, options, expectedJson) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', ...options });
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${path}: expected ${expected}, received ${response.status}: ${body.slice(0, 300)}`);
  }

  if (expectedJson) {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`${path}: expected application/json, received ${contentType || 'no content type'}`);
    }

    const body = await response.json();
    for (const [key, value] of Object.entries(expectedJson)) {
      if (body?.[key] !== value) {
        throw new Error(`${path}: expected JSON ${key}=${value}, received ${JSON.stringify(body).slice(0, 300)}`);
      }
    }
  }

  console.log(`PASS ${expected} ${path}`);
}

if (!baseUrl.startsWith('https://') && process.env.ALLOW_HTTP_SMOKE !== 'true') {
  throw new Error('Staging smoke tests require HTTPS. Set ALLOW_HTTP_SMOKE=true only for local proxy verification.');
}

await check('/', 200);
await check('/packages', 200);
await check('/api/health', 200, undefined, { success: true });
await check('/api/health/ready', 200, undefined, { success: true });
await check('/api/bookings/my', 401, undefined, { success: false });
await check('/api/admin/dashboard', 401, undefined, { success: false });
await check('/api/not-a-route', 404, undefined, { success: false });
await check('/api/auth/login', 403, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'invalid', password: '' })
}, { success: false, code: 'CSRF_REJECTED' });
await check('/api/auth/login', 400, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-la-chef-request': '1' },
  body: JSON.stringify({ email: 'invalid', password: '' })
}, { success: false });

console.log('Staging smoke checks passed.');
