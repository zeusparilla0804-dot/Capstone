for (const path of ['/api/health', '/api/auth/me', '/api/admin/dashboard']) {
  const response = await fetch(`http://localhost:3000${path}`);
  console.log(JSON.stringify({ path, status: response.status, type: response.headers.get('content-type') }));
}
for (const supplied of [false, true]) {
  const response = await fetch('http://localhost:3000/api/auth/login', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(supplied ? { 'x-la-chef-request': '1' } : {}) },
    body: JSON.stringify({ email: 'invalid', password: '' }) });
  const body = await response.json();
  console.log(JSON.stringify({ csrfHeader: supplied, status: response.status, code: body.code }));
}
