import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sql from 'mssql';
import { AppError } from '../utils/app-error.js';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';

const serviceModule = await import('./admin.service.js');
const repositoryModule = await import('../repositories/admin.repository.js');

type QueryResult = {
  recordset?: Record<string, unknown>[];
  recordsets?: Record<string, unknown>[][];
  rowsAffected?: number[];
};

class RequestRecorder {
  readonly calls: { command: string; params: Record<string, unknown> }[] = [];
  private readonly params: Record<string, unknown> = {};

  constructor(private readonly responder: (command: string) => QueryResult = () => ({ recordset: [] })) {}

  input(name: string, _type: unknown, value: unknown) {
    this.params[name] = value;
    return this;
  }

  replaceInput(name: string, _type: unknown, value: unknown) {
    this.params[name] = value;
    return this;
  }

  async query(command: string) {
    this.calls.push({ command, params: { ...this.params } });
    return this.responder(command);
  }
}

function repositoryWith(recorder: RequestRecorder) {
  const create = (repositoryModule as Record<string, unknown>)['createAdminOperationsRepository'];
  assert.equal(typeof create, 'function', 'admin operations repository factory must exist');
  return (create as (deps: {
    readRequest: () => Promise<sql.Request>;
    transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
  }) => Record<string, (...args: never[]) => Promise<unknown>>)({
    readRequest: async () => recorder as unknown as sql.Request,
    transaction: async <T>(work: (request: sql.Request) => Promise<T>) => work(recorder as unknown as sql.Request)
  });
}

test('admin operations queries use UTC month boundaries and keep verified revenue separate from submitted proofs', async () => {
  const observed: unknown[] = [];
  const create = (serviceModule as Record<string, unknown>)['createAdminOperationsService'];
  assert.equal(typeof create, 'function', 'admin operations service factory must exist');
  const service = (create as Function)({
    dashboard: async (period: unknown) => {
      observed.push(period);
      return { period: '2026-10', priority: {}, ledger: {}, actionQueues: [], attention: [] };
    }
  }, () => new Date('2026-10-31T23:59:59.000Z'));

  await service.dashboard(undefined);
  assert.deepEqual(observed[0], {
    key: '2026-10',
    start: new Date('2026-10-01T00:00:00.000Z'),
    end: new Date('2026-11-01T00:00:00.000Z')
  });

  const recorder = new RequestRecorder(() => ({
    recordsets: [[{
      pendingBookingReviews: 2,
      proofsAwaitingVerification: 3,
      confirmedEventsNextSevenDays: 4,
      outstandingBalanceTotal: 500,
      failedEmailNotifications: 1,
      confirmedRevenue: 1200,
      submittedProofValue: 350,
      overdueOutstanding: 80,
      averageConfirmedBookingValue: 600
    }], []]
  }));
  const repository = repositoryWith(recorder);
  const result = await repository['dashboard']({
    key: '2026-10', start: new Date('2026-10-01T00:00:00.000Z'), end: new Date('2026-11-01T00:00:00.000Z')
  }) as { ledger: Record<string, number> };

  assert.equal(result.ledger['confirmedRevenue'], 1200);
  assert.equal(result.ledger['submittedProofValue'], 350);
  const call = recorder.calls[0]!;
  assert.match(call.command, /FROM dbo\.PAYMENT_TRANSACTION/i);
  assert.match(call.command, /PAYMENT_PROOF[\s\S]*status\s*=\s*'SUBMITTED'/i);
  assert.doesNotMatch(call.command, /SUM\s*\(\s*p\.amount_paid\s*\).*confirmedRevenue/i);
  assert.equal((call.params['periodStart'] as Date).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal((call.params['periodEnd'] as Date).toISOString(), '2026-11-01T00:00:00.000Z');
});

test('admin operations queries order attention deterministically', async () => {
  const recorder = new RequestRecorder(() => ({ recordsets: [[], []] }));
  const repository = repositoryWith(recorder);
  await repository['dashboard']({ key: '2026-10', start: new Date('2026-10-01'), end: new Date('2026-11-01') });
  assert.match(recorder.calls[0]!.command, /pp\.payment_proof_id/i);
  assert.doesNotMatch(recorder.calls[0]!.command, /pp\.proof_id\b/i);
  assert.match(recorder.calls[0]!.command, /ORDER BY\s+urgencyRank\s*,\s*eventDate\s*,\s*stableId/i);
});

test('admin operations queries fetch customer history directly by customer_id with bounded pagination', async () => {
  const recorder = new RequestRecorder(() => ({ recordset: [{ id: 501, total_count: 101 }] }));
  const repository = repositoryWith(recorder);
  const result = await repository['customerBookings'](77, { page: 6, pageSize: 20 }) as {
    items: { id: number }[]; totalItems: number;
  };
  assert.equal(result.items[0]!.id, 501);
  assert.equal(result.totalItems, 101);
  assert.match(recorder.calls[0]!.command, /WHERE\s+r\.customer_id\s*=\s*@customerId/i);
  assert.equal(recorder.calls[0]!.params['customerId'], 77);
  assert.equal(recorder.calls[0]!.params['offset'], 100);

  const create = (serviceModule as Record<string, unknown>)['createAdminOperationsService'] as Function;
  const service = create({ customerBookings: async () => ({ items: [] }) }, () => new Date());
  assert.throws(
    () => service.customerBookings(77, { page: '1', pageSize: '101' }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );
  assert.throws(
    () => service.customerBookings(77, { page: '107374184', pageSize: '20' }),
    (error: unknown) => error instanceof AppError && error.statusCode === 400
  );

  const paymentsRecorder = new RequestRecorder(() => ({ recordset: [] }));
  const paymentsRepository = repositoryWith(paymentsRecorder);
  await paymentsRepository['customerPayments'](77, { page: 1, pageSize: 20 });
  assert.match(paymentsRecorder.calls[0]!.command, /pt\.payment_transaction_id/i);
  assert.doesNotMatch(paymentsRecorder.calls[0]!.command, /pt\.transaction_id\b/i);
});

test('admin customer list and detail include account status without credential data', async () => {
  const source = readFileSync(new URL('../repositories/admin.repository.ts', import.meta.url), 'utf8');
  assert.match(source, /customer_id\s+id[\s\S]*status[\s\S]*FROM\s+dbo\.CUSTOMER/i);
  assert.doesNotMatch(source, /SELECT[^;`]*\bpassword\b[^;`]*FROM\s+dbo\.CUSTOMER/i);
});

test('admin operations queries bind outbox and audit filters and preserve bigint identifiers', async () => {
  const outboxRecorder = new RequestRecorder(() => ({
    recordset: [
      { id: '9007199254740993', templateKey: 'BOOKING_RECEIVED', payload: '{"bookingReference":"BK-1"}', total_count: 2 },
      { id: '9007199254740994', templateKey: 'PASSWORD_RESET_REQUESTED',
        payload: '{"accountName":"Secret Name","accountType":"CUSTOMER","selector":"aaaaaaaaaaaaaaaaaaaaaa"}', total_count: 2 }
    ]
  }));
  const outboxRepository = repositoryWith(outboxRecorder);
  const outbox = await outboxRepository['emailOutbox']({
    page: 1, pageSize: 20, search: 'customer', status: 'FAILED', templateKey: 'BOOKING_RECEIVED',
    relatedEntityType: 'BOOKING', relatedEntityId: '9007199254740995'
  }) as { items: { id: string; payload: Record<string, unknown> }[] };
  assert.equal(outbox.items[0]!.id, '9007199254740993');
  assert.equal(outbox.items[0]!.payload['bookingReference'], 'BK-1');
  assert.deepEqual(outbox.items[1]!.payload, { sensitive: true });
  assert.deepEqual(outboxRecorder.calls[0]!.params, {
    search: 'customer', status: 'FAILED', templateKey: 'BOOKING_RECEIVED', relatedEntityType: 'BOOKING',
    relatedEntityId: '9007199254740995', offset: 0, pageSize: 20
  });

  const auditRecorder = new RequestRecorder(() => ({
    recordset: [{ id: '9007199254740997', oldValues: null, newValues: '{"status":"CONFIRMED"}', total_count: 1 }]
  }));
  const auditRepository = repositoryWith(auditRecorder);
  const audit = await auditRepository['auditLog']({
    page: 2, pageSize: 10, adminId: 4, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING',
    entityId: 12, dateFrom: '2026-10-01', dateTo: '2026-10-31'
  }) as { items: { id: string; newValues: Record<string, unknown> }[] };
  assert.equal(audit.items[0]!.id, '9007199254740997');
  assert.equal(audit.items[0]!.newValues['status'], 'CONFIRMED');
  assert.equal(auditRecorder.calls[0]!.params['offset'], 10);
  assert.equal(auditRecorder.calls[0]!.params['adminId'], 4);
  assert.equal(auditRecorder.calls[0]!.params['dateFrom'], '2026-10-01');
  assert.equal(auditRecorder.calls[0]!.params['dateTo'], '2026-10-31');
});

test('admin operations queries retry only failed outbox rows and use development preview', async () => {
  const recorder = new RequestRecorder(command => {
    if (/UPDATE dbo\.EMAIL_OUTBOX/i.test(command)) return { rowsAffected: [1] };
    return { recordset: [] };
  });
  const repository = repositoryWith(recorder);
  assert.equal(await repository['retryEmail'](9, '9007199254740993'), true);
  const retryCall = recorder.calls.find(call => /UPDATE dbo\.EMAIL_OUTBOX/i.test(call.command));
  assert.ok(retryCall);
  assert.match(retryCall.command, /WHERE\s+notification_id=@outboxId\s+AND\s+status='FAILED'/i);
  assert.equal(retryCall.params['outboxId'], '9007199254740993');

  const create = (serviceModule as Record<string, unknown>)['createAdminOperationsService'] as Function;
  const service = create({
    retryEmail: async () => true,
    renderEmailPreview: async (id: string) => ({ subject: `Preview ${id}`, text: 'Text', html: '<p>Text</p>' })
  }, () => new Date());
  const preview = await service.emailPreview('9007199254740993');
  assert.equal(preview.subject, 'Preview 9007199254740993');
});
