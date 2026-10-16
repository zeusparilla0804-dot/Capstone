import 'dotenv/config';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';

process.env['EMAIL_WORKER_ENABLED'] = 'false';

const [{ default: app }, database, { environment }, { hashPassword }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/config/environment.js'),
  import('../src/utils/password.js'),
]);

if (environment.isProduction) throw new Error('Custom quotation E2E verification is disabled in production.');

const marker = `CQE2E-${randomUUID().slice(0, 8)}`;
const password = `Quote-${randomUUID()}!aA1`;
const customerAEmail = `${marker.toLowerCase()}-a@example.test`;
const customerBEmail = `${marker.toLowerCase()}-b@example.test`;
const adminEmail = `${marker.toLowerCase()}-admin@example.test`;
let adminId = 0;
let sourcePackageId = 0;
let server: ReturnType<typeof app.listen> | undefined;

type ApiResult = { response: Response; body: any };

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value, 'Expected a session cookie.');
  return value.split(';', 1)[0]!;
}

async function api(
  base: string,
  path: string,
  init: RequestInit = {},
  expected: number | readonly number[] = 200,
): Promise<ApiResult> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json();
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(allowed.includes(response.status), `${init.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return { response, body };
}

async function cleanup(): Promise<void> {
  const pool = await database.getDbPool();
  await pool.request()
    .input('customerA', sql.NVarChar(255), customerAEmail)
    .input('customerB', sql.NVarChar(255), customerBEmail)
    .input('adminEmail', sql.NVarChar(255), adminEmail)
    .input('sourcePackageId', sql.Int, sourcePackageId || 0)
    .query(`
      DECLARE @customerAId int=(SELECT customer_id FROM dbo.CUSTOMER WHERE email=@customerA);
      DECLARE @customerBId int=(SELECT customer_id FROM dbo.CUSTOMER WHERE email=@customerB);
      DECLARE @adminId int=(SELECT admin_id FROM dbo.ADMIN WHERE email=@adminEmail);

      DELETE eo FROM dbo.EMAIL_OUTBOX eo
      WHERE eo.recipient IN(@customerA,@customerB,@adminEmail)
        OR (eo.related_entity_type='CUSTOM_EVENT_REQUEST' AND eo.related_entity_id IN(
          SELECT q.request_id FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
          WHERE r.customer_id IN(@customerAId,@customerBId)
        ));
      DELETE h FROM dbo.BOOKING_STATUS_HISTORY h JOIN dbo.RESERVATION r ON r.reservation_id=h.reservation_id
        WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE ii FROM dbo.INVOICE_ITEM ii JOIN dbo.INVOICE i ON i.invoice_id=ii.invoice_id
        JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE i FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
        WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE pt FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id
        JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE p FROM dbo.PAYMENT p JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
        WHERE r.customer_id IN(@customerAId,@customerBId);
      UPDATE dbo.RESERVATION SET accepted_quote_id=NULL WHERE customer_id IN(@customerAId,@customerBId);
      DELETE qi FROM dbo.CUSTOM_QUOTE_ITEM qi JOIN dbo.CUSTOM_QUOTE cq ON cq.quote_id=qi.quote_id
        JOIN dbo.CUSTOM_EVENT_REQUEST q ON q.request_id=cq.request_id
        JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE cq FROM dbo.CUSTOM_QUOTE cq JOIN dbo.CUSTOM_EVENT_REQUEST q ON q.request_id=cq.request_id
        JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE q FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
        WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE ra FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.RESERVATION r ON r.reservation_id=ra.reservation_id
        WHERE r.customer_id IN(@customerAId,@customerBId);
      DELETE FROM dbo.RESERVATION WHERE customer_id IN(@customerAId,@customerBId);
      DELETE FROM dbo.PACKAGE WHERE package_id=@sourcePackageId;
      DELETE FROM dbo.AUTH_SESSION WHERE customer_id IN(@customerAId,@customerBId);
      DELETE FROM dbo.CUSTOMER WHERE customer_id IN(@customerAId,@customerBId);
      DELETE FROM dbo.ADMIN_SESSION WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId;
      DELETE FROM dbo.ADMIN WHERE admin_id=@adminId;
    `);
}

function requestBody(eventType: string, eventDate: string, suffix: string, guestCount = 120, sourcePackageId?: number): string {
  return JSON.stringify({
    eventType, eventDate, eventTime: '17:30', venue: `${marker} ${suffix} Venue`, guestCount,
    ...(sourcePackageId ? { sourcePackageId } : {}),
    targetBudget: 150000, menuPreferences: 'Filipino buffet with plated dessert',
    dietaryNotes: 'Two vegetarian meals', setupPreferences: 'Warm white floral styling',
    requestedServices: ['Catering', 'Styling'], specialRequest: `${marker} ${suffix}`,
  });
}

try {
  await cleanup();
  const pool = await database.getDbPool();
  const event = (await pool.request().query('SELECT TOP 1 event_id,event_type FROM dbo.EVENT ORDER BY event_id')).recordset[0];
  assert.ok(event, 'At least one EVENT reference row is required for custom quotation E2E verification.');
  const sourcePackage = await pool.request()
    .input('eventId', sql.Int, Number(event.event_id))
    .input('name', sql.NVarChar(150), `${marker} Inspiration Package`)
    .query(`INSERT dbo.PACKAGE(
      event_id,package_name,description,pricing_type,price_per_head,base_price,included_guests,
      excess_guest_price,min_guest,max_guest,is_active
    ) OUTPUT INSERTED.package_id VALUES(
      @eventId,@name,'Disposable custom quotation E2E package','PER_HEAD',650,NULL,NULL,NULL,50,200,1
    )`);
  sourcePackageId = Number(sourcePackage.recordset[0].package_id);

  const admin = await pool.request()
    .input('username', sql.NVarChar(100), `${marker}-admin`)
    .input('email', sql.NVarChar(255), adminEmail)
    .input('name', sql.NVarChar(200), `${marker} Administrator`)
    .input('password', sql.NVarChar(255), await hashPassword(password))
    .query(`INSERT dbo.ADMIN(username,email,full_name,password,role,status) OUTPUT INSERTED.admin_id
      VALUES(@username,@email,@name,@password,'ADMIN','ACTIVE')`);
  adminId = Number(admin.recordset[0].admin_id);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server!.once('listening', resolve); server!.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api`;

  const adminLogin = await api(base, '/auth/admin/login', {
    method: 'POST', body: JSON.stringify({ identity: adminEmail, password }),
  });
  const adminCookie = cookie(adminLogin.response);
  const register = async (email: string) => api(base, '/auth/register', {
    method: 'POST', body: JSON.stringify({ firstName: marker, lastName: 'Customer', email, phone: '09171234567', password }),
  }, 201);
  const customerA = await register(customerAEmail);
  const customerB = await register(customerBEmail);
  const customerACookie = cookie(customerA.response);
  const customerBCookie = cookie(customerB.response);

  const month = String((Number.parseInt(marker.slice(-2), 16) % 9) + 1).padStart(2, '0');
  const primaryDate = `2096-${month}-10`;
  const primary = await api(base, '/custom-events', {
    method: 'POST', headers: { cookie: customerACookie },
    body: requestBody(String(event.event_type), primaryDate, 'Primary', 120, sourcePackageId),
  }, 201);
  const primaryId = Number(primary.body.data.id);
  const primaryReservationId = Number(primary.body.data.reservationId);
  assert.equal(primary.body.data.status, 'AWAITING_QUOTE');

  const ownerDetail = await api(base, `/custom-events/${primaryId}`, { headers: { cookie: customerACookie } });
  assert.equal(ownerDetail.body.data.menuPreferences, 'Filipino buffet with plated dessert');
  await api(base, `/custom-events/${primaryId}`, { headers: { cookie: customerBCookie } }, 404);
  const queue = await api(base, `/admin/custom-events?search=${encodeURIComponent(marker)}&status=AWAITING_QUOTE`, {
    headers: { cookie: adminCookie },
  });
  assert.ok(queue.body.data.items.some((item: { id: number }) => item.id === primaryId));

  const quoteBody = (unitPrice: number) => JSON.stringify({
    items: [
      { description: 'Complete catering service', quantity: 120, unitPrice },
      { description: 'Coffee station', quantity: 1.5, unitPrice: 1000 },
    ],
    requiredDownPayment: 35000, validUntil: '2099-12-31', terms: 'Balance due seven days before the event.',
  });
  const quoteOne = await api(base, `/admin/custom-events/${primaryId}/quotes`, {
    method: 'POST', headers: { cookie: adminCookie }, body: quoteBody(900),
  }, 201);
  const quoteTwo = await api(base, `/admin/custom-events/${primaryId}/quotes`, {
    method: 'POST', headers: { cookie: adminCookie }, body: quoteBody(950),
  }, 201);
  assert.equal(quoteOne.body.data.version, 1);
  assert.equal(quoteTwo.body.data.version, 2);
  const quotedDetail = await api(base, `/custom-events/${primaryId}`, { headers: { cookie: customerACookie } });
  assert.equal(quotedDetail.body.data.currentQuote.id, quoteTwo.body.data.id);
  assert.equal(quotedDetail.body.data.quoteHistory.find((quote: { id: number }) => quote.id === quoteOne.body.data.id).status, 'SUPERSEDED');

  const acceptPath = `/custom-events/${primaryId}/quotes/${quoteTwo.body.data.id}/accept`;
  const concurrentAccept = await Promise.all([
    api(base, acceptPath, { method: 'POST', headers: { cookie: customerACookie }, body: '{}' }, [200, 409]),
    api(base, acceptPath, { method: 'POST', headers: { cookie: customerACookie }, body: '{}' }, [200, 409]),
  ]);
  assert.deepEqual(concurrentAccept.map(result => result.response.status).sort(), [200, 409]);
  const financials = await pool.request().input('reservationId', sql.Int, primaryReservationId).query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.PAYMENT WHERE reservation_id=@reservationId) payment_count,
      (SELECT COUNT(*) FROM dbo.INVOICE WHERE reservation_id=@reservationId) invoice_count,
      (SELECT COUNT(*) FROM dbo.INVOICE_ITEM ii JOIN dbo.INVOICE i ON i.invoice_id=ii.invoice_id
        WHERE i.reservation_id=@reservationId) invoice_line_count,
      (SELECT total_amount FROM dbo.RESERVATION WHERE reservation_id=@reservationId) reservation_total;
  `);
  assert.equal(Number(financials.recordset[0].payment_count), 1);
  assert.equal(Number(financials.recordset[0].invoice_count), 1);
  assert.equal(Number(financials.recordset[0].invoice_line_count), 2);
  assert.equal(Number(financials.recordset[0].reservation_total), 115500);

  const declineDate = `2096-${month}-11`;
  const declineRequest = await api(base, '/custom-events', {
    method: 'POST', headers: { cookie: customerACookie }, body: requestBody(String(event.event_type), declineDate, 'Decline'),
  }, 201);
  const declineQuote = await api(base, `/admin/custom-events/${declineRequest.body.data.id}/quotes`, {
    method: 'POST', headers: { cookie: adminCookie }, body: quoteBody(800),
  }, 201);
  await api(base, `/custom-events/${declineRequest.body.data.id}/quotes/${declineQuote.body.data.id}/decline`, {
    method: 'POST', headers: { cookie: customerACookie }, body: JSON.stringify({ reason: 'Plans changed.' }),
  });
  const declined = await pool.request().input('reservationId', sql.Int, Number(declineRequest.body.data.reservationId)).query(`
    SELECT r.status,
      (SELECT COUNT(*) FROM dbo.PAYMENT WHERE reservation_id=r.reservation_id) payment_count,
      (SELECT COUNT(*) FROM dbo.INVOICE WHERE reservation_id=r.reservation_id) invoice_count
    FROM dbo.RESERVATION r WHERE r.reservation_id=@reservationId;
  `);
  assert.equal(declined.recordset[0].status, 'CANCELLED');
  assert.equal(Number(declined.recordset[0].payment_count), 0);
  assert.equal(Number(declined.recordset[0].invoice_count), 0);

  const capacityDate = `2096-${month}-20`;
  for (let index = 1; index <= 5; index += 1) {
    await api(base, '/custom-events', {
      method: 'POST', headers: { cookie: customerACookie },
      body: requestBody(String(event.event_type), capacityDate, `Capacity ${index}`, 20),
    }, 201);
  }
  const finalSlot = await Promise.all([
    api(base, '/custom-events', {
      method: 'POST', headers: { cookie: customerACookie },
      body: requestBody(String(event.event_type), capacityDate, 'Capacity race A', 20),
    }, [201, 409]),
    api(base, '/custom-events', {
      method: 'POST', headers: { cookie: customerBCookie },
      body: requestBody(String(event.event_type), capacityDate, 'Capacity race B', 20),
    }, [201, 409]),
  ]);
  assert.deepEqual(finalSlot.map(result => result.response.status).sort(), [201, 409]);
  const capacityCount = await pool.request()
    .input('eventDate', sql.Date, new Date(`${capacityDate}T00:00:00.000Z`))
    .query(`SELECT COUNT(*) total FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
      WHERE r.event_date=@eventDate AND r.status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')`);
  assert.equal(Number(capacityCount.recordset[0].total), 6);

  const audit = await pool.request().input('adminId', sql.Int, adminId)
    .query(`SELECT COUNT(*) total FROM dbo.ADMIN_AUDIT_LOG WHERE admin_id=@adminId AND action='CUSTOM_QUOTE_SENT'`);
  assert.equal(Number(audit.recordset[0].total), 3);
  console.log('Custom event quotation E2E passed: ownership, versions, atomic acceptance, decline, and capacity race.');
} finally {
  if (server) await new Promise<void>(resolve => {
    server!.close(() => resolve()); server!.closeAllConnections();
  });
  try { await cleanup(); } finally { await database.closeDatabase(); }
}
