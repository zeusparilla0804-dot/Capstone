import assert from 'node:assert/strict';
import test from 'node:test';
import type sql from 'mssql';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

async function optional(path: string) {
  return import(path).catch(error => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; return undefined; });
}
const workerModule = await optional('./email-worker.service.js');
const repositoryModule = await optional('../repositories/email-outbox.repository.js');
const notificationModule = await optional('./notification.service.js');
const templateModule = await optional('../templates/email-templates.js');
const configModule = await import('../config/environment.js');
const now = new Date('2026-10-02T00:00:00.000Z');
const settings = { enabled: true, pollIntervalMs: 5, batchSize: 10, maxAttempts: 5,
  retryBaseMs: 60_000, retryCapMs: 3_600_000, leaseMs: 300_000 };
const input = { recipient: ' Customer@Example.test ', templateKey: 'BOOKING_RECEIVED',
  payload: { customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-12-01' },
  relatedEntityType: 'BOOKING', relatedEntityId: '9007199254740993' };

class OutboxDb {
  rows: any[] = [];
  commands: { command: string; params: Record<string, any>; transactional: boolean }[] = [];
  events: string[] = [];
  request(transactional = false): sql.Request {
    const params: Record<string, any> = {};
    const request = {
      replaceInput(name: string, _type: unknown, value: unknown) { params[name] = value; return request; },
      query: async (command: string) => {
        const p = { ...params }; this.commands.push({ command, params: p, transactional });
        const result = (rows: any[] = [], count = rows.length) => ({ recordset: structuredClone(rows), rowsAffected: [count] });
        if (/INSERT dbo.EMAIL_OUTBOX/.test(command)) {
          const row = { id: '9007199254740993', recipient: p.recipient, normalizedRecipient: p.normalizedRecipient,
            templateKey: p.templateKey, payload: p.payload, relatedEntityType: p.relatedEntityType,
            relatedEntityId: p.relatedEntityId, status: 'PENDING', attemptCount: 0,
            nextAttemptAt: now, createdAt: now, updatedAt: now };
          this.rows.push(row); return result([{ id: row.id }]);
        }
        if (/UPDATE due/.test(command)) {
          assert.ok(transactional, 'claims must use a transaction');
          for (const hint of ['UPDLOCK', 'READPAST', 'ROWLOCK']) assert.ok(command.includes(hint));
          assert.match(command, /attempt_count\s*=\s*attempt_count\s*\+\s*1/);
          assert.match(command, /OUTPUT CONVERT\(varchar\(20\),\s*INSERTED.notification_id\)/i);
          const rows = this.rows.filter(row => (row.status === 'PENDING' && (!row.nextAttemptAt || +new Date(row.nextAttemptAt) <= +p.now)) ||
            (row.status === 'PROCESSING' && +new Date(row.updatedAt) <= +p.leaseCutoff)).slice(0, p.batchSize);
          for (const row of rows) Object.assign(row, { status: 'PROCESSING', attemptCount: row.attemptCount + 1, updatedAt: p.now });
          return result(rows);
        }
        if (/UPDATE dbo.EMAIL_OUTBOX/.test(command)) {
          assert.match(command, /status='PROCESSING'.*attempt_count=@claimedAttempt/s);
          const row = this.rows.find(row => row.id === p.outboxId && row.status === 'PROCESSING' && row.attemptCount === p.claimedAttempt);
          if (!row) return result([], 0);
          Object.assign(row, { status: p.outcome, lastError: p.lastError, nextAttemptAt: p.nextAttemptAt,
            sentAt: p.sentAt, updatedAt: p.now }); return result([], 1);
        }
        if (/FROM dbo.EMAIL_OUTBOX/.test(command)) return result(this.rows.filter(row => row.id === p.outboxId));
        throw new Error(`Unexpected SQL: ${command}`);
      }
    };
    return request as unknown as sql.Request;
  }
  repository() {
    assert.equal(typeof repositoryModule?.createEmailOutboxRepository, 'function', 'email outbox repository must exist');
    return repositoryModule.createEmailOutboxRepository({ readRequest: () => this.request(),
      transaction: async (work: (request: sql.Request) => Promise<unknown>) => {
        this.events.push('begin'); const snapshot = structuredClone(this.rows);
        try { const value = await work(this.request(true)); this.events.push('commit'); return value; }
        catch (error) { this.rows = snapshot; this.events.push('rollback'); throw error; }
      } });
  }
  notification(nodeEnv = 'development') {
    assert.equal(typeof notificationModule?.createNotificationService, 'function', 'notification service must exist');
    return notificationModule.createNotificationService({ repository: this.repository(), nodeEnv });
  }
  worker(transport?: any, overrides = {}, renderPasswordResetEmail = async () => undefined,
    renderUpcomingEventReminder = async () => undefined, renderEmailVerificationCode = async () => undefined) {
    assert.equal(typeof workerModule?.createEmailWorker, 'function', 'email outbox worker must exist');
    return workerModule.createEmailWorker({ repository: this.repository(), transport, settings: { ...settings, ...overrides },
      from: { name: 'LA Chef Event Catering Services', address: 'chef@example.test' },
      renderPasswordResetEmail, renderUpcomingEventReminder, renderEmailVerificationCode });
  }
  async seed() { await this.notification().queueNotification(input); }
}

test('email outbox queues immediate PENDING intent and preserves exact bigint and recipient', async () => {
  const db = new OutboxDb();
  const id = await db.notification().queueNotification(input, db.request(true));
  assert.equal(id, '9007199254740993');
  assert.equal(db.rows[0].recipient, 'Customer@Example.test'); assert.equal(db.rows[0].normalizedRecipient, 'customer@example.test');
  assert.equal(db.rows[0].relatedEntityId, '9007199254740993'); assert.equal(db.rows[0].status, 'PENDING'); assert.equal(db.rows[0].attemptCount, 0);
  const query = db.commands[0]!; assert.ok(query.transactional);
  assert.match(query.command, /sysutcdatetime\(\)/); assert.match(query.command, /CONVERT\(varchar\(20\),\s*INSERTED.notification_id\)/i);
});

test('email outbox rejects secrets, proof data, malformed payloads, templates, recipients and numeric bigint IDs before insert', async () => {
  for (const invalid of [
    { templateKey: 'UNKNOWN' }, { templateKey: 'toString' }, { recipient: 'x\r\nBcc: victim@example.test' },
    { recipient: 'no-address' }, { relatedEntityId: 9007199254740992 }, { relatedEntityId: '9223372036854775808' },
    { relatedEntityId: '0' }, { relatedEntityType: undefined }, { payload: [] }, { payload: {} },
    ...['password', 'token', 'storageKey', 'proofPath', 'attachments', 'proofContents', 'invoiceNumber'].map(key => ({ payload: { ...input.payload, [key]: 'secret' } }))
  ]) {
    const db = new OutboxDb(); await assert.rejects(db.notification().queueNotification({ ...input, ...invalid })); assert.equal(db.rows.length, 0);
  }
});

test('email outbox disabled transport never claims or mutates pending or stale rows', async () => {
  const db = new OutboxDb(); await db.seed(); db.rows.push({ ...db.rows[0], id: '2', status: 'PROCESSING', updatedAt: '2026-10-01' });
  const snapshot = structuredClone(db.rows); db.commands = [];
  assert.deepEqual(await db.worker().processEmailBatch(now), { disabled: true, claimed: 0, sent: 0, retried: 0, failed: 0 });
  assert.deepEqual(db.rows, snapshot); assert.equal(db.commands.length, 0);
  await db.worker({ sendMail: async () => { throw new Error('must not send'); } }, { enabled: false }).processEmailBatch(now);
  assert.deepEqual(db.rows, snapshot); assert.equal(db.commands.length, 0);
});

test('email outbox configured delivery marks SENT and clears old retry/error metadata without attachments', async () => {
  const db = new OutboxDb(); await db.seed(); db.rows[0].lastError = 'old'; const messages: any[] = [];
  const result = await db.worker({ sendMail: async (message: any) => { messages.push(message); return { accepted: [message.to], rejected: [] }; } }).processEmailBatch(now);
  assert.equal(result.sent, 1); assert.equal(db.rows[0].status, 'SENT'); assert.deepEqual(db.rows[0].sentAt, now);
  assert.equal(db.rows[0].lastError, null); assert.equal(db.rows[0].nextAttemptAt, null); assert.equal(db.rows[0].attemptCount, 1);
  assert.equal(messages[0].to, 'Customer@Example.test'); assert.equal(messages[0].from.name, 'LA Chef Event Catering Services');
  assert.equal('attachments' in messages[0], false); assert.equal(messages[0].disableFileAccess, true); assert.equal(messages[0].disableUrlAccess, true);
  assert.ok(messages[0].text.includes('BK-5')); assert.ok(messages[0].html.includes('BK-5'));
});

test('Resend delivery retries throttling and reuses the outbox idempotency key before marking SENT', async () => {
  const { createResendTransport } = await import('./resend-transport.js');
  const db = new OutboxDb(); await db.seed();
  const keys: (string | null)[] = [];
  const transport = createResendTransport('re_test_only', (async (_url, options) => {
    keys.push(new Headers(options?.headers).get('Idempotency-Key'));
    return keys.length === 1 ? Response.json({}, { status: 429 }) : Response.json({ id: 'provider-id' });
  }) as typeof fetch);
  const worker = db.worker(transport);
  const first = await worker.processEmailBatch(now);
  assert.equal(first.sent, 0);
  assert.equal(first.retried, 1);
  assert.equal(db.rows[0].status, 'PENDING');
  const second = await worker.processEmailBatch(new Date(+now + 60_000));
  assert.equal(second.sent, 1);
  assert.equal(db.rows[0].status, 'SENT');
  assert.ok(keys[0]);
  assert.equal(keys[0], keys[1]);
});

test('email code uses only its protected renderer and is never persisted in the outbox payload', async () => {
  for (const available of [true, false]) {
    const db = new OutboxDb();
    await db.notification().queueNotification({ recipient: input.recipient, templateKey: 'EMAIL_VERIFICATION_CODE',
      payload: { accountName: 'Juan', accountType: 'CUSTOMER', selector: 'a'.repeat(22) } });
    let sent: any;
    const result = await db.worker({ sendMail: async (message: unknown) => { sent = message; return {}; } }, {}, undefined, undefined,
      (async () => available ? { subject: 'Verification', text: '012345', html: '<p>012345</p>' } : undefined) as any).processEmailBatch(now);
    assert.equal(result.sent, available ? 1 : 0);
    assert.equal(result.failed, available ? 0 : 1);
    assert.equal(sent?.text, available ? '012345' : undefined);
    assert.equal(JSON.stringify(db.rows[0].payload).includes('012345'), false);
    await assert.rejects(db.notification().renderEmailPreview(db.rows[0].id), (error: any) => error.statusCode === 404);
  }
});

test('email worker retires queued custom quotation messages without sending dead links', async () => {
  const db = new OutboxDb();
  await db.notification().queueNotification({
    recipient: 'customer@example.test',
    templateKey: 'CUSTOM_QUOTE_SENT',
    payload: {
      customerName: 'Customer',
      bookingReference: 'CQ-2026-ABCDEF12',
      eventDate: '2026-12-01',
      quoteTotal: '2600.00',
      validUntil: '2026-12-31',
      actionUrl: 'http://localhost:4200/custom-events/12',
    },
    relatedEntityType: 'CUSTOM_EVENT_REQUEST',
    relatedEntityId: '12',
  });
  let sends = 0;

  const result = await db.worker({ sendMail: async () => { sends += 1; return {}; } }).processEmailBatch(now);

  assert.equal(sends, 0);
  assert.equal(result.failed, 1);
  assert.equal(db.rows[0].status, 'FAILED');
  assert.equal(db.rows[0].lastError, 'CUSTOM_QUOTATION_RETIRED');
});

test('email worker uses the protected renderer for reset messages and fails closed when token is unavailable', async () => {
  for (const available of [true, false]) {
    const db = new OutboxDb();
    await db.notification().queueNotification({ recipient: 'customer@example.test', templateKey: 'PASSWORD_RESET_REQUESTED',
      payload: { accountName: 'Customer', accountType: 'CUSTOMER', selector: 'a'.repeat(22) } });
    const messages: unknown[] = [];
    const rendered = { subject: 'Reset password', text: 'protected reset link', html: '<p>protected reset link</p>' };
    const result = await db.worker({ sendMail: async (message: unknown) => { messages.push(message); return {}; } }, {},
      async () => available ? rendered : undefined).processEmailBatch(now);
    assert.equal(result.sent, available ? 1 : 0);
    assert.equal(result.failed, available ? 0 : 1);
    assert.equal(messages.length, available ? 1 : 0);
    assert.equal(db.rows[0].status, available ? 'SENT' : 'FAILED');
  }
});

test('email worker revalidates upcoming reminders and refuses stale delivery', async () => {
  for (const available of [true, false]) {
    const db = new OutboxDb();
    await db.notification().queueNotification({
      recipient: 'customer@example.test',
      templateKey: 'UPCOMING_EVENT_REMINDER' as any,
      payload: { customerName: 'Customer', bookingReference: 'BK-5', eventDate: '2026-10-05' },
      relatedEntityType: 'BOOKING',
      relatedEntityId: '5'
    });
    const messages: unknown[] = [];
    const rendered = { subject: 'Upcoming event', text: 'Reminder', html: '<p>Reminder</p>' };
    const result = await db.worker(
      { sendMail: async (message: unknown) => { messages.push(message); return {}; } },
      {},
      async () => undefined,
      async () => available ? rendered : undefined
    ).processEmailBatch(now);
    assert.equal(result.sent, available ? 1 : 0);
    assert.equal(result.failed, available ? 0 : 1);
    assert.equal(messages.length, available ? 1 : 0);
    assert.equal(db.rows[0].status, available ? 'SENT' : 'FAILED');
    if (!available) assert.equal(db.rows[0].lastError, 'REMINDER_NO_LONGER_APPLICABLE');
  }
});

test('password reset notification preview is unavailable in development without reconstruction', async () => {
  const db = new OutboxDb();
  await db.notification().queueNotification({ recipient: 'customer@example.test', templateKey: 'PASSWORD_RESET_REQUESTED',
    payload: { accountName: 'Customer', accountType: 'CUSTOMER', selector: 'a'.repeat(22) } });
  await assert.rejects(db.notification().renderEmailPreview('9007199254740993'), (error: any) => error.statusCode === 404);
});

for (const [attempt, delay] of [[0, 60_000], [1, 120_000], [7, 3_600_000]]) {
  test(`email outbox transient retry after attempt ${attempt! + 1} has bounded delay ${delay}`, async () => {
    const db = new OutboxDb(); await db.seed(); db.rows[0].attemptCount = attempt;
    const error = Object.assign(new Error('password=secret C:\\proofs\\image.png\nmessage contents'), { code: 'ETIMEDOUT', responseCode: 421 });
    const result = await db.worker({ sendMail: async () => { throw error; } }, { maxAttempts: 20 }).processEmailBatch(now);
    assert.equal(result.retried, 1); assert.equal(db.rows[0].status, 'PENDING'); assert.equal(+db.rows[0].nextAttemptAt, +now + delay!);
    assert.match(db.rows[0].lastError, /421|ETIMEDOUT/); assert.ok(db.rows[0].lastError.length <= 200);
    assert.equal(/secret|proofs|image|contents|\n/.test(db.rows[0].lastError), false);
    assert.equal((await db.worker({ sendMail: async () => assert.fail('not due') }).processEmailBatch(now)).claimed, 0);
  });
}

for (const error of [{ responseCode: 550 }, { code: 'EENVELOPE' }, { code: 'EMESSAGE' }, { code: 'EAUTH' }]) {
  test(`email outbox permanent error ${JSON.stringify(error)} fails immediately`, async () => {
    const db = new OutboxDb(); await db.seed();
    assert.equal((await db.worker({ sendMail: async () => { throw error; } }).processEmailBatch(now)).failed, 1);
    assert.equal(db.rows[0].status, 'FAILED'); assert.equal(db.rows[0].nextAttemptAt, null);
  });
}

test('email outbox max attempts fails and exhausted stale claims never send again', async () => {
  for (const attempt of [4, 5]) {
    const db = new OutboxDb(); await db.seed(); db.rows[0].attemptCount = attempt;
    if (attempt === 5) Object.assign(db.rows[0], { status: 'PROCESSING', updatedAt: '2026-10-01' });
    let calls = 0;
    assert.equal((await db.worker({ sendMail: async () => { calls++; throw { code: 'ECONNECTION' }; } }).processEmailBatch(now)).failed, 1);
    assert.equal(db.rows[0].status, 'FAILED'); assert.equal(calls, attempt === 5 ? 0 : 1);
  }
});

test('email outbox two workers recover stale leases without double claiming live rows', async () => {
  const db = new OutboxDb(); await db.seed(); Object.assign(db.rows[0], { status: 'PROCESSING', updatedAt: '2026-10-01', attemptCount: 1 });
  db.rows.push({ ...db.rows[0], id: '2', updatedAt: now });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let sends = 0;
  const transport = { sendMail: async () => { sends++; await gate; return {}; } };
  const first = db.worker(transport).processEmailBatch(now);
  await new Promise(resolve => setTimeout(resolve, 10));
  const second = await db.worker(transport).processEmailBatch(now); assert.equal(second.claimed, 0); release();
  assert.equal((await first).sent, 1); assert.equal(sends, 1); assert.equal(db.rows[0].attemptCount, 2); assert.equal(db.rows[1].status, 'PROCESSING');
});

test('email outbox expired owner cannot overwrite the newer claim outcome', async () => {
  const db = new OutboxDb(); await db.seed(); const repo = db.repository();
  const [old] = await repo.claim(now, settings);
  const [current] = await repo.claim(new Date(+now + settings.leaseMs), settings);
  assert.equal(await repo.finish(current, { status: 'SENT' }, new Date(+now + settings.leaseMs)), true);
  assert.equal(await repo.finish(old, { status: 'FAILED', error: 'old worker' }, now), false); assert.equal(db.rows[0].status, 'SENT');
});

test('email outbox development preview escapes every value and does not mutate rows; production refuses before read', async () => {
  const db = new OutboxDb(); await db.notification().queueNotification({ ...input,
    payload: { customerName: '<img src=x onerror="evil">', bookingReference: 'BK-&<5>', eventDate: '2026-12-01' } });
  const snapshot = structuredClone(db.rows);
  const preview = await db.notification().renderEmailPreview('9007199254740993');
  assert.ok(preview.html.includes('&lt;img')); assert.equal(preview.html.includes('<img'), false); assert.ok(preview.html.includes('&amp;&lt;5&gt;'));
  assert.ok(preview.text.includes('<img')); assert.deepEqual(db.rows, snapshot);
  db.commands = []; await assert.rejects(db.notification('production').renderEmailPreview('9007199254740993'), (error: any) => error.statusCode === 404);
  assert.equal(db.commands.length, 0);
  await assert.rejects(db.notification().renderEmailPreview('9223372036854775808')); await assert.rejects(db.notification().renderEmailPreview('2'));
});

test('email outbox every existing template renders truthful branded subject/text/HTML', () => {
  assert.equal(typeof templateModule?.renderEmail, 'function', 'email templates must exist');
  for (const key of ['BOOKING_RECEIVED', 'BOOKING_APPROVED', 'BOOKING_REJECTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED',
    'BOOKING_COMPLETED', 'BOOKING_RESCHEDULED', 'UPCOMING_EVENT_REMINDER', 'INVOICE_ISSUED', 'PAYMENT_PROOF_SUBMITTED',
    'PAYMENT_PROOF_VERIFIED', 'PAYMENT_PROOF_REJECTED']) {
    const payload = { ...input.payload, ...(key === 'INVOICE_ISSUED' ? { invoiceNumber: 'INV-8' } : {}),
      ...(key === 'PAYMENT_PROOF_VERIFIED' ? { amount: '50.25' } : {}) };
    const rendered = templateModule.renderEmail(key, payload);
    assert.ok(rendered.subject); assert.ok(rendered.text.includes('LA Chef Event Catering Services')); assert.ok(rendered.html.includes('BK-5'));
    if (key === 'PAYMENT_PROOF_SUBMITTED') assert.match(rendered.text, /verification/i);
    if (key === 'PAYMENT_PROOF_VERIFIED') { assert.match(rendered.text, /manually verified/i); assert.equal(/settled|online payment/i.test(rendered.text), false); }
  }
  const registered = templateModule.renderEmail('ACCOUNT_REGISTERED', { displayName: 'Juan Customer' });
  assert.match(registered.subject, /account/i);
  assert.match(registered.text, /Juan Customer/);
  assert.match(registered.text, /LA Chef Event Catering Services/);
});

test('email outbox SMTP absent is disabled; any partial or unsafe configuration fails', () => {
  const read = (configModule as any).readEmailConfiguration;
  assert.equal(typeof read, 'function', 'SMTP configuration validation must exist');
  const disabled = read({}); assert.equal(disabled.smtp, undefined); assert.equal(disabled.worker.enabled, false);
  const complete = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: 'sender',
    SMTP_PASSWORD: 'placeholder', SMTP_FROM_ADDRESS: 'sender@example.test' };
  for (const key of Object.keys(complete)) { const partial = { ...complete }; delete (partial as any)[key]; assert.throws(() => read(partial)); }
  for (const invalid of [{ SMTP_HOST: '' }, { SMTP_PORT: '0' }, { SMTP_SECURE: 'yes' }, { SMTP_FROM_ADDRESS: 'bad\r\nBcc:x@y.z' },
    { SMTP_FROM_NAME: 'Chef\nBcc' }, { EMAIL_WORKER_BATCH_SIZE: '0' }, { EMAIL_WORKER_MAX_ATTEMPTS: '1.5' },
    { EMAIL_WORKER_RETRY_BASE_MS: '4000000' }, { EMAIL_WORKER_LEASE_MS: '1' }]) assert.throws(() => read({ ...complete, ...invalid }));
  assert.throws(() => read({ SMTP_FROM_NAME: 'Chef' }));
  const enabled = read(complete); assert.equal(enabled.worker.enabled, true); assert.equal(enabled.smtp.from.name, 'LA Chef Event Catering Services');
  assert.equal(enabled.worker.pollIntervalMs, 5_000); assert.equal(read({ ...complete, EMAIL_WORKER_POLL_INTERVAL_MS: '30000' }).worker.pollIntervalMs, 30_000);
  assert.equal(enabled.worker.batchSize, 10); assert.equal(enabled.worker.maxAttempts, 5);
  assert.equal(enabled.worker.retryBaseMs, 60_000); assert.equal(enabled.worker.retryCapMs, 3_600_000); assert.equal(enabled.worker.leaseMs, 300_000);
});

test('email worker sends time-sensitive codes before ordinary notifications even when SQL output is unordered', async () => {
  const db = new OutboxDb(); await db.seed();
  await db.notification().queueNotification({ recipient: 'customer@example.test', templateKey: 'EMAIL_VERIFICATION_CODE',
    payload: { accountName: 'Customer', selector: 'a'.repeat(22), accountType: 'CUSTOMER' } });
  db.rows.forEach((row, index) => { row.id = String(index + 1); });
  const subjects: string[] = [];
  const rendered = { subject: 'Verification code', text: 'test code', html: '<p>test code</p>' };
  const result = await db.worker({ sendMail: async (message: any) => { subjects.push(message.subject); return {}; } }, {},
    async () => undefined, async () => undefined, async () => rendered).processEmailBatch(now);
  assert.equal(result.sent, 2);
  assert.equal(subjects[0], 'Verification code');
  const claim = db.commands.find(item => /UPDATE due/.test(item.command))!;
  assert.match(claim.command, /ORDER BY CASE WHEN template_key IN\s*\('EMAIL_VERIFICATION_CODE',\s*'PASSWORD_RESET_REQUESTED'\)/);
});

test('email outbox worker lifecycle is non-overlapping and stop awaits delivery before closing transport', async () => {
  const db = new OutboxDb(); await db.seed(); let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const sending = new Promise<void>(resolve => { entered = resolve; });
  let sends = 0, closed = false;
  const worker = db.worker({ sendMail: async () => { sends++; entered(); await gate; return {}; }, close: () => { closed = true; } });
  worker.start(); worker.start(); await sending; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sends, 1); assert.equal(db.events.filter(event => event === 'begin').length, 1);
  let stopped = false; const stop = worker.stop().then(() => { stopped = true; });
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(stopped, false); assert.equal(closed, false);
  release(); await stop; assert.equal(closed, true); assert.equal(db.rows[0].status, 'SENT');
  const claims = db.events.length; await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(db.events.length, claims);
});
