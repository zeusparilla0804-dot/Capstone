import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';
import { renderEmail, validateEmailPayload } from './email-templates.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
const { notificationService, queueBookingNotification } = await import('../services/notification.service.js');
const { emailOutboxRepository, createEmailOutboxRepository } = await import('../repositories/email-outbox.repository.js');
const { environment } = await import('../config/environment.js');

const legacy = { customerName: 'Juan', bookingReference: 'BK-42', eventDate: '2026-11-20', invoiceNumber: 'INV-2026-42' };
const invoice = {
  ...legacy, customerName: 'Juan & <Family>', bookingStatus: 'APPROVED',
  eventType: 'Wedding & celebration', eventTime: '13:05', venue: 'Hall <North>', guestCount: '499',
  invoiceUrl: 'https://lachef.example/invoice/42', invoiceDueDate: '2026-11-20', paymentMethod: 'CASH',
  totalAmount: '100.01', amountPaid: '20.00', requiredDeposit: '50.01', remainingDeposit: '30.01', remainingBalance: '80.01',
  cashDepositDueDate: '2026-11-17', cashPreparationDays: '3',
};

test('payment request email waits for admin request and the assigned QR', () => {
  const context = { customerName: legacy.customerName, bookingReference: legacy.bookingReference, eventDate: legacy.eventDate };
  const approved = renderEmail('BOOKING_APPROVED', context);
  const requested = renderEmail('PAYMENT_REQUESTED', context);
  assert.match(approved.text, /notify you when payment is requested/i);
  assert.match(requested.text, /choose bank transfer or cash/i);
  assert.match(requested.text, /wait for your assigned QR/i);
});

test('invoice email organizes event, billing, cash deadline and office payment instructions', () => {
  const message = renderEmail('INVOICE_ISSUED', invoice);
  for (const value of [
    'Your reservation has been approved', 'LA Chef will notify you when payment is requested', 'BK-42', 'Wedding & celebration', 'November 20, 2026',
    '1:05 PM Philippine Time', 'Hall <North>', '499', 'INV-2026-42',
    'Invoice total: PHP 100.01', 'Recorded payments: PHP 20.00', 'Required deposit (50%): PHP 50.01',
    'Remaining deposit to pay: PHP 30.01', 'Outstanding balance: PHP 80.01', 'Balance due: November 20, 2026',
    'November 17, 2026, 6:00 PM Philippine Time', '3 calendar days before your event',
    'Panorama Ville, Dita, Santa Rosa, Laguna', 'Daily, 8:00 AM-6:00 PM Philippine Time',
    'Present your booking reference BK-42', 'Collect your receipt', 'No online payment proof is required for cash payments.',
    'Sign in to your LA Chef account', 'https://lachef.example/invoice/42',
  ]) assert.ok(message.text.includes(value), `missing ${value}`);
  assert.match(message.html, /max-width:600px/);
  assert.match(message.html, /Juan &amp; &lt;Family&gt;/);
  assert.match(message.html, /Hall &lt;North&gt;/);
  assert.match(message.html, /href="https:\/\/lachef.example\/invoice\/42"/);
  assert.match(message.html, />View invoice<\/a>/);
  assert.doesNotMatch(message.html, /<script|<img|<form|fonts.googleapis/i);
  assert.doesNotMatch(message.text, /booking is confirmed|reservation is confirmed|remaining balance is due on the event date/i);
  assert.ok(message.text.indexOf('Event details') < message.text.indexOf('Invoice summary'));
  assert.ok(message.text.indexOf('Invoice summary') < message.text.indexOf('Cash payment'));
});

test('legacy invoice and approval outbox payloads remain renderable without invented values', () => {
  const message = renderEmail('INVOICE_ISSUED', legacy);
  assert.match(message.text, /INV-2026-42/);
  assert.doesNotMatch(message.text, /undefined|NaN|PHP|\/invoice\/|Panorama/);
  assert.doesNotThrow(() => renderEmail('BOOKING_APPROVED', { customerName: 'Juan', bookingReference: 'BK-42', eventDate: '2026-11-20' }));
});

for (const [method, label] of [['E_WALLET', 'GCash'], ['BANK_TRANSFER', 'Bank transfer']] as const) {
  test(`${label} invoice directs the customer to portal instructions without claiming payment is enabled`, () => {
    const { cashDepositDueDate, cashPreparationDays, ...online } = invoice;
    const message = renderEmail('INVOICE_ISSUED', { ...online, paymentMethod: method, bookingStatus: 'AWAITING_PAYMENT' });
    assert.ok(message.text.includes(`Payment method: ${label}`));
    assert.match(message.text, method === 'E_WALLET' ? /GCash is no longer accepted/ : /Review your invoice and follow the payment instructions in your account/);
    assert.doesNotMatch(message.text, /has been approved|Cash payment|Panorama|submit.*proof|payment.*verified|account number/i);
  });
}

test('fully paid invoice does not request another deposit or cash payment', () => {
  const message = renderEmail('INVOICE_ISSUED', { ...invoice, amountPaid: '100.01', remainingDeposit: '0.00', remainingBalance: '0.00' });
  assert.match(message.text, /No further payment is required/);
  assert.doesNotMatch(message.text, /Pay the remaining required deposit|6:00 PM Philippine Time|Present your booking reference/);
});

test('extended invoice payload rejects unsupported, unsafe or malformed fields', () => {
  for (const addition of [
    { unknown: 'value' }, { eventTime: '25:00' }, { eventTime: '1:05' }, { invoiceDueDate: '2026-02-30' },
    { cashDepositDueDate: 'invalid' }, { guestCount: '0' }, { guestCount: '499.5' }, { cashPreparationDays: '4' },
    { totalAmount: '-1.00' }, { requiredDeposit: '50.001' }, { amountPaid: 'NaN' }, { paymentMethod: 'BITCOIN' },
    { bookingStatus: 'MADE_UP' }, { venue: 'Hall\nInjected' }, { venue: 'a'.repeat(501) },
    { invoiceUrl: 'javascript:alert(1)' }, { invoiceUrl: 'https://user:pass@lachef.example/invoice/42' },
    { invoiceUrl: 'https://lachef.example/invoice/42?token=secret' }, { invoiceUrl: 'https://lachef.example/not-an-invoice/42' },
  ]) assert.throws(() => validateEmailPayload('INVOICE_ISSUED', { ...invoice, ...addition }), `accepted ${JSON.stringify(addition)}`);
  assert.throws(() => validateEmailPayload('BOOKING_RECEIVED', { customerName: 'Juan', bookingReference: 'BK-42', eventDate: '2026-11-20', invoiceUrl: invoice.invoiceUrl }));
});

for (const [guestCount, cashDepositDueDate, cashPreparationDays] of [[499, '2026-11-17', '3'], [500, '2026-11-15', '5']] as const) {
  test(`queued invoice snapshot uses the ${cashPreparationDays}-day cash cutoff and cent-rounded remaining deposit for ${guestCount} guests`, async t => {
    const request = {} as sql.Request;
    t.mock.method(notificationService, 'bookingContext', async () => ({ customerEmail: 'juan@example.test', customerName: 'Juan',
      bookingReference: 'BK-42', eventDate: '2026-11-20', invoiceNumber: 'INV-2026-42', invoiceId: 42,
      invoiceDueDate: '2026-11-20', eventTime: '13:05', eventType: 'Wedding', venue: 'Hall', guestCount,
      status: 'APPROVED', paymentMethod: 'CASH', totalAmount: 100.01, amountPaid: 20 }));
    let queued: any;
    t.mock.method(emailOutboxRepository, 'insert', async (input, suppliedRequest) => {
      assert.equal(suppliedRequest, request); queued = input; return '81';
    });
    assert.equal(await queueBookingNotification(42, 'INVOICE_ISSUED', request, {}, 'INVOICE', '42'), '81');
    assert.deepEqual({ total: queued.payload.totalAmount, paid: queued.payload.amountPaid, required: queued.payload.requiredDeposit,
      remainingDeposit: queued.payload.remainingDeposit, balance: queued.payload.remainingBalance },
    { total: '100.01', paid: '20.00', required: '50.01', remainingDeposit: '30.01', balance: '80.01' });
    assert.equal(queued.payload.invoiceUrl, new URL('/invoice/42', environment.frontendOrigin).toString());
    assert.equal(queued.payload.cashDepositDueDate, cashDepositDueDate);
    assert.equal(queued.payload.cashPreparationDays, cashPreparationDays);
    assert.equal(queued.payload.invoiceDueDate, '2026-11-20');
    assert.equal(queued.payload.eventTime, '13:05');
    assert.equal(queued.payload.bookingStatus, 'APPROVED');
    assert.equal(queued.relatedEntityType, 'INVOICE');
  });
}

test('invoice context reads the issued invoice snapshot and recorded payment within the supplied request', async () => {
  let command = '';
  const context = { customerEmail: 'juan@example.test', customerName: 'Juan', bookingReference: 'BK-42', eventDate: '2026-11-20' };
  const request = { replaceInput() { return this; }, async query(value: string) { command = value; return { recordset: [context] }; } } as unknown as sql.Request;
  const repository = createEmailOutboxRepository({ readRequest: () => { throw new Error('must use supplied transaction'); }, transaction: async () => { throw new Error('unexpected transaction'); } });
  assert.equal(await repository.bookingContext(42, request), context);
  for (const field of ['invoiceId', 'invoiceDueDate', 'eventTime', 'eventType', 'venue', 'status', 'totalAmount', 'amountPaid']) assert.ok(command.includes(field), `context missing ${field}`);
  assert.match(command, /i\.total_amount\s+totalAmount/);
  assert.match(command, /CONVERT\(varchar\(5\),r\.event_time,108\)\s+eventTime/);
});

test('persisted E-WALLET booking method queues a GCash invoice without blocking approval', async t => {
  t.mock.method(notificationService, 'bookingContext', async () => ({ customerEmail: 'juan@example.test', customerName: 'Juan',
    bookingReference: 'BK-42', eventDate: '2026-11-20', invoiceNumber: 'INV-2026-42', invoiceId: 42,
    invoiceDueDate: '2026-11-20', eventTime: '13:05', eventType: 'Wedding', venue: 'Hall', guestCount: 100,
    status: 'APPROVED', paymentMethod: 'E-WALLET', totalAmount: 100.01, amountPaid: 0 }));
  let queued: any;
  t.mock.method(emailOutboxRepository, 'insert', async input => { queued = input; return '82'; });
  assert.equal(await queueBookingNotification(42, 'INVOICE_ISSUED', {} as sql.Request, {}, 'INVOICE', '42'), '82');
  assert.equal(queued.payload.paymentMethod, 'E_WALLET');
  assert.match(renderEmail('INVOICE_ISSUED', queued.payload).text, /Payment method: GCash/);
  assert.equal(queued.payload.cashDepositDueDate, undefined);
});

test('multiline venue and event labels queue as escaped single-line email details without changing stored text', async t => {
  const context = { customerEmail: 'juan@example.test', customerName: 'Juan',
    bookingReference: 'BK-42', eventDate: '2026-11-20', invoiceNumber: 'INV-2026-42', invoiceId: 42,
    invoiceDueDate: '2026-11-20', eventTime: '13:05', eventType: 'Wedding\n&\tcelebration',
    venue: 'Hall A <North>\nSanta\tRosa', guestCount: 100,
    status: 'APPROVED', paymentMethod: 'CASH', totalAmount: 100.01, amountPaid: 0 };
  t.mock.method(notificationService, 'bookingContext', async () => context);
  let queued: any;
  t.mock.method(emailOutboxRepository, 'insert', async input => { queued = input; return '83'; });
  assert.equal(await queueBookingNotification(42, 'INVOICE_ISSUED', {} as sql.Request, {}, 'INVOICE', '42'), '83');
  assert.equal(queued.payload.venue, 'Hall A <North> Santa Rosa');
  assert.equal(queued.payload.eventType, 'Wedding & celebration');
  const message = renderEmail('INVOICE_ISSUED', queued.payload);
  assert.match(message.html, /Hall A &lt;North&gt; Santa Rosa/);
  assert.match(message.html, /Wedding &amp; celebration/);
  assert.equal(context.venue, 'Hall A <North>\nSanta\tRosa');
  assert.equal(context.eventType, 'Wedding\n&\tcelebration');
});
