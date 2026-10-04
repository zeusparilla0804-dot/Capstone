import 'dotenv/config';

import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import sql from 'mssql';

const adminEmail = 'browser.admin@example.test';
const customerEmail = 'browser.customer@example.test';
const password = 'Browser-QA-2026!';
const packageName = 'Browser QA Package';
const uploadRoot = resolve('var/uploads/browser-e2e');
const receiptJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==',
  'base64',
);
process.env['PAYMENT_PROOF_UPLOAD_ROOT'] = uploadRoot;
process.env['EMAIL_WORKER_ENABLED'] = 'false';

const [{ default: app }, database, { environment }, { hashPassword }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js')
]);

if (environment.isProduction) throw new Error('Browser fixtures are disabled in production.');

async function cleanup(): Promise<void> {
  const pool = await database.getDbPool();
  await pool.request()
    .input('customerEmail', sql.NVarChar(255), customerEmail)
    .input('adminEmail', sql.NVarChar(255), adminEmail)
    .input('packageName', sql.NVarChar(150), packageName)
    .query(`
      DECLARE @customerId int=(SELECT customer_id FROM dbo.CUSTOMER WHERE email=@customerEmail);
      DECLARE @adminId int=(SELECT admin_id FROM dbo.ADMIN WHERE email=@adminEmail);
      DELETE FROM dbo.EMAIL_OUTBOX WHERE recipient=@customerEmail;
      DELETE pp FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id WHERE r.customer_id=@customerId;
      DELETE h FROM dbo.BOOKING_STATUS_HISTORY h JOIN dbo.RESERVATION r ON r.reservation_id=h.reservation_id WHERE r.customer_id=@customerId;
      DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId OR (entity_type='BOOKING' AND entity_id IN(SELECT reservation_id FROM dbo.RESERVATION WHERE customer_id=@customerId));
      DELETE ii FROM dbo.INVOICE_ITEM ii JOIN dbo.INVOICE i ON i.invoice_id=ii.invoice_id JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id WHERE r.customer_id=@customerId;
      DELETE i FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id WHERE r.customer_id=@customerId;
      DELETE pt FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id WHERE r.customer_id=@customerId;
      DELETE p FROM dbo.PAYMENT p JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id WHERE r.customer_id=@customerId;
      DELETE ra FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.RESERVATION r ON r.reservation_id=ra.reservation_id WHERE r.customer_id=@customerId;
      DELETE FROM dbo.RESERVATION WHERE customer_id=@customerId;
      DELETE FROM dbo.PACKAGE WHERE package_name=@packageName;
      DELETE FROM dbo.AUTH_SESSION WHERE customer_id=@customerId;
      DELETE FROM dbo.CUSTOMER WHERE customer_id=@customerId;
      DELETE FROM dbo.ADMIN_SESSION WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN WHERE admin_id=@adminId;
    `);
  await rm(uploadRoot, { recursive: true, force: true });
}

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value);
  return value.split(';', 1)[0]!;
}

async function api(path: string, init: RequestInit = {}, expected = 200): Promise<any> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(`http://localhost:${environment.port}/api${path}`, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, expected, `${init.method ?? 'GET'} ${path}: ${JSON.stringify(body)}`);
  return { response, body };
}

await cleanup();
if (process.argv.includes('--cleanup-only')) {
  await database.closeDatabase();
  process.exit(0);
}
await mkdir(uploadRoot, { recursive: true });
const pool = await database.getDbPool();
const event = (await pool.request().query('SELECT TOP 1 event_id,event_type FROM dbo.EVENT ORDER BY event_id')).recordset[0];
assert.ok(event, 'Browser QA requires an EVENT reference row.');
await pool.request()
  .input('username', sql.NVarChar(100), 'browser-admin')
  .input('email', sql.NVarChar(255), adminEmail)
  .input('name', sql.NVarChar(200), 'Browser QA Administrator')
  .input('password', sql.NVarChar(255), await hashPassword(password))
  .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status)
    VALUES(@username,@email,@name,@password,'ADMIN','ACTIVE')`);

const server = app.listen(environment.port, '127.0.0.1');
await new Promise<void>((accept, reject) => {
  server.once('listening', accept);
  server.once('error', reject);
});

const registered = await api('/auth/register', { method: 'POST', body: JSON.stringify({
  firstName: 'Browser', lastName: 'Customer', email: customerEmail, phone: '09171234567', password
}) }, 201);
const customerCookie = cookie(registered.response);
const adminLogin = await api('/auth/admin/login', { method: 'POST', body: JSON.stringify({ identity: adminEmail, password }) });
const adminCookie = cookie(adminLogin.response);
const packageResult = await api('/admin/packages', { method: 'POST', headers: { cookie: adminCookie }, body: JSON.stringify({
  eventId: Number(event.event_id), name: packageName, description: 'Disposable browser QA package',
  pricePerGuest: 250, minGuests: 10, maxGuests: 50, isActive: true
}) }, 201);
const eventDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const bookingResult = await api('/bookings', { method: 'POST', headers: { cookie: customerCookie }, body: JSON.stringify({
  eventType: event.event_type, eventDate, eventTime: '14:00', venue: 'Browser QA Venue', guestCount: 10,
  packageId: Number(packageResult.body.data.id), addOnIds: [], paymentMethod: 'e-wallet'
}) }, 201);
const bookingId = Number(bookingResult.body.data.id);
await api(`/admin/bookings/${bookingId}/status`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'APPROVED' }) });
await api(`/admin/bookings/${bookingId}/invoice`, { method: 'POST', headers: { cookie: adminCookie }, body: '{}' }, 201);
await api(`/admin/bookings/${bookingId}/status`, { method: 'PATCH', headers: { cookie: adminCookie }, body: JSON.stringify({ status: 'AWAITING_PAYMENT' }) });
const proof = new FormData();
proof.set('method', 'E_WALLET');
proof.set('claimedAmount', '500.00');
proof.set('transactionReference', 'BROWSER-QA-REFERENCE');
proof.set('paymentDate', eventDate);
proof.set('proof', new Blob([receiptJpeg], { type: 'image/jpeg' }), 'browser-proof.jpg');
await api(`/bookings/${bookingId}/payment-proofs`, { method: 'POST', headers: { cookie: customerCookie }, body: proof }, 201);

console.log(`Browser QA fixture ready at http://localhost:${environment.port}`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>(resolveClose => {
    server.close(() => resolveClose());
    server.closeAllConnections();
  });
  try { await cleanup(); } finally { await database.closeDatabase(); }
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
