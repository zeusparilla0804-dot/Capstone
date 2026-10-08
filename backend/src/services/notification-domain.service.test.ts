import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
const { createBooking } = await import('../repositories/booking.repository.js');
const { createInvoice } = await import('../repositories/invoice.repository.js');
const { closeDatabase } = await import('../config/database.js');

for (const kind of ['booking', 'invoice'] as const) {
  for (const failQueue of [false, true]) {
    test(`email outbox ${kind} ${failQueue ? 'queue failure rolls back domain' : 'commits PENDING intent without SMTP'}`, async t => {
      let active = false; const events: string[] = []; let domain: string[] = [], outbox: any[] = [];
      const pool = { connected: true, close: async () => {} };
      t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
      t.mock.method(sql.Transaction.prototype, 'begin', async function () { active = true; events.push('begin'); return this; });
      t.mock.method(sql.Transaction.prototype, 'commit', async () => { active = false; events.push('commit'); });
      t.mock.method(sql.Transaction.prototype, 'rollback', async () => { active = false; domain = []; outbox = []; events.push('rollback'); });
      t.mock.method(sql.Request.prototype, 'query', async function (command: string) {
        assert.ok(active, 'all domain writes and customer context must use the open transaction');
        const p = Object.fromEntries(Object.entries(this.parameters).map(([name, param]) => [name, param.value]));
        const result = (recordset: any[] = []) => ({ recordset, rowsAffected: [1] });
        if (/email outbox context.*customerEmail.*FROM dbo\.RESERVATION/is.test(command)) return result([{ customerEmail: 'Customer@Example.test', customerName: 'Customer',
          bookingReference: 'BK-5', eventDate: '2026-12-01', invoiceNumber: 'INV-8' }]);
        if (/INSERT dbo.EMAIL_OUTBOX/.test(command)) {
          if (failQueue) throw new Error('outbox insert failed');
          outbox.push({ templateKey: p.templateKey, payload: p.payload, status: 'PENDING', attempts: 0 }); return result([{ id: '9007199254740993' }]);
        }
        if (/FROM dbo.PACKAGE p/.test(command)) return result([{ package_id: 1, package_name: 'Wedding Package', event_type: 'Wedding',
          price_per_head: 100, min_guest: 1, max_guest: 200 }]);
        if (/COUNT_BIG\s*\(\s*\*\s*\).*FROM dbo\.RESERVATION/is.test(command)) {
          assert.match(command, /WITH\s*\(UPDLOCK,HOLDLOCK\)/i);
          return result([{ activeBookingCount: 0, largestGuestCount: 0, hasMediumEvent: 0 }]);
        }
        if (/SELECT event_id/.test(command)) return result([{ event_id: 1 }]);
        if (/INSERT dbo.RESERVATION/.test(command)) { domain.push('booking'); return result([{ reservation_id: 5, created_at: new Date() }]); }
        if (/INSERT dbo.PAYMENT/.test(command)) { domain.push('payment'); return result(); }
        if (/SELECT r.reservation_id/.test(command)) {
          if (kind === 'invoice') assert.match(command, /WITH\s*\(UPDLOCK,HOLDLOCK\)/i);
          return result([{ reservation_id: 5, status: 'APPROVED', guest_count: 10,
            package_unit_price: 100, subtotal: 1000, discount_amount: 0, total_amount: 1000, package_name: 'Wedding' }]);
        }
        if (/SELECT invoice_id/.test(command)) return result();
        if (/INSERT dbo.INVOICE\(/.test(command)) { domain.push('invoice'); return result([{ invoice_id: 8 }]); }
        if (/INSERT dbo.INVOICE_ITEM/.test(command)) { domain.push('item'); return result(); }
        if (/INSERT dbo.ADMIN_AUDIT_LOG/.test(command)) { domain.push('audit'); return result(); }
        throw new Error(`Unexpected query: ${command}`);
      });
      const operation = () => kind === 'booking' ? createBooking(7, { packageId: 1, eventType: 'Wedding', guestCount: 10,
        addOnIds: [], eventDate: '2026-12-01', eventTime: '12:00', venue: 'Venue', paymentMethod: 'cash' }) : createInvoice(5, 2);
      try {
        if (failQueue) {
          await assert.rejects(operation(), /outbox insert failed/); assert.deepEqual(domain, []); assert.deepEqual(outbox, []);
          assert.deepEqual(events, ['begin', 'rollback']);
        } else {
          await operation(); assert.equal(outbox.length, 1); assert.equal(outbox[0].templateKey, kind === 'booking' ? 'BOOKING_RECEIVED' : 'INVOICE_ISSUED');
          assert.equal(outbox[0].status, 'PENDING'); assert.equal(outbox[0].attempts, 0); assert.ok(domain.length >= 2);
          if (kind === 'invoice') assert.ok(domain.includes('audit'));
          assert.deepEqual(events, ['begin', 'commit']);
        }
      } finally { await closeDatabase(); }
    });
  }
}
