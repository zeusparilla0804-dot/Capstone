import assert from 'node:assert/strict';
import test from 'node:test';
import sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { closeDatabase } = await import('../config/database.js');
const { recordInvoiceRefund } = await import('../services/invoice.service.js');

const payout = { amount: 4000, refundDate: '2026-01-02', reference: 'REFUND-42' };

test('an assessed refund is recorded once and the original payment ledger is preserved', async t => {
  let stored: Record<string, unknown> | undefined;
  let audit: Record<string, unknown> | undefined;
  let assessment: Record<string, unknown> | undefined = { kind: 'EARLY', date: '2026-01-01', refundableAmount: 4000, forfeitedAmount: 1000 };
  let status = 'CANCELLED';
  let paid = 5000;
  let duplicateReference = false;
  const events: string[] = [];
  const pool = { connected: true, close: async () => {} };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => pool);
  t.mock.method(sql.Transaction.prototype, 'begin', async () => { events.push('begin'); });
  t.mock.method(sql.Transaction.prototype, 'commit', async () => { events.push('commit'); });
  t.mock.method(sql.Transaction.prototype, 'rollback', async () => { events.push('rollback'); });
  t.mock.method(sql.Request.prototype, 'query', async function (this: sql.Request, command: string) {
    const value = (key: string) => this.parameters[key]?.value;
    if (command.startsWith('SELECT reservation_id')) return { recordset: value('invoiceId') === 8 ? [{ reservation_id: 42 }] : [] };
    if (command.includes('WITH(UPDLOCK,HOLDLOCK)')) {
      assert.equal(value('reservationId'), 42);
      events.push('lock');
      return { recordset: [{ status }] };
    }
    if (command.includes('FROM dbo.INVOICE_REFUND')) return { recordset: stored ? [stored] : [] };
    if (command.includes('cancellation_assessment')) {
      return { recordset: [{ amount_paid: paid, cancellation_assessment: assessment ? JSON.stringify(assessment) : null }] };
    }
    if (command.includes('INSERT dbo.INVOICE_REFUND')) {
      if (duplicateReference) throw Object.assign(new Error('Duplicate reference'), { number: 2601 });
      events.push('refund');
      stored = {
        refund_amount: value('refundAmount'), refund_date: value('refundDate'),
        reference: value('refundReference'), review_note: value('refundNote'),
      };
      assert.equal(value('recordedBy'), 2);
      return { recordset: [] };
    }
    if (command.includes('INSERT dbo.ADMIN_AUDIT_LOG')) {
      events.push('audit');
      audit = { action: value('auditAction'), id: value('auditEntityId'), data: JSON.parse(value('auditNewValues') as string) };
      return { recordset: [] };
    }
    throw new Error('Unexpected query or write to the payment ledger');
  });

  try {
    await assert.rejects(recordInvoiceRefund(9, 2, payout), { statusCode: 404 });
    status = 'CONFIRMED';
    await assert.rejects(recordInvoiceRefund(8, 2, payout), { statusCode: 409 });
    status = 'CANCELLED';
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, amount: 3999.99 }), /assessed refund amount/);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, amount: 5000.01 }), /verified payments/);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, amount: 4000.001 }), /two decimal places/);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, refundDate: '9999-01-01' }), /on or before today/);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, reference: ' ' }), /Refund reference/);
    assert.equal(stored, undefined);

    events.length = 0;
    const result = await recordInvoiceRefund(8, 2, payout);
    assert.deepEqual(result, { status: 'REFUNDED', amount: 4000, date: '2026-01-02', reference: 'REFUND-42' });
    assert.deepEqual(await recordInvoiceRefund(8, 2, payout), result);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, reference: 'OTHER' }), { statusCode: 409 });
    assert.deepEqual(events, ['begin', 'lock', 'refund', 'audit', 'commit', 'begin', 'lock', 'commit', 'begin', 'lock', 'rollback']);
    assert.deepEqual(audit, { action: 'REFUND_RECORDED', id: 8, data: { reservationId: 42, ...result } });

    stored = undefined;
    assessment = undefined;
    await assert.rejects(recordInvoiceRefund(8, 2, payout), /signed agreement/);
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, amount: 0 }), /date and reference blank/);
    duplicateReference = true;
    await assert.rejects(recordInvoiceRefund(8, 2, { ...payout, reviewNote: 'Signed agreement reviewed.' }), { statusCode: 409 });
    duplicateReference = false;
    paid = 0;
    await assert.rejects(recordInvoiceRefund(8, 2, { amount: 0, reviewNote: 'Signed agreement reviewed.' }), /no verified payments/);
    paid = 5000;
    const decision = await recordInvoiceRefund(8, 2, { amount: 0, reviewNote: ' Signed agreement reviewed. ' });
    assert.deepEqual(decision, { status: 'NO_REFUND_DUE', amount: 0, reviewNote: 'Signed agreement reviewed.' });
    assert.deepEqual(audit, { action: 'REFUND_DECISION_RECORDED', id: 8, data: { reservationId: 42, ...decision } });
  } finally {
    await closeDatabase();
  }
});
