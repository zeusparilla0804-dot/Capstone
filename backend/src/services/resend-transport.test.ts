import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FRONTEND_URL ??= 'http://localhost:4200';
process.env.PAYMENT_PROOF_UPLOAD_ROOT ??= 'test-proofs';
process.env.DB_SERVER ??= 'localhost';
process.env.DB_DATABASE ??= 'test';
process.env.DB_USER ??= 'test';
process.env.DB_PASSWORD ??= 'test';

const { readEmailConfiguration } = await import('../config/environment.js');
const transportModule = await import('./resend-transport.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return undefined;
});
function transport(fetcher: typeof fetch) {
  assert.equal(typeof transportModule?.createResendTransport, 'function');
  return transportModule!.createResendTransport('re_test_only', fetcher);
}
const message = {
  from: { name: 'LA Chef', address: 'no-reply@la-chef.online' }, to: 'customer@example.test',
  subject: 'Verify your account', text: 'Your code is 012345', html: '<p>Your code is 012345</p>',
  idempotencyKey: 'outbox-42', disableFileAccess: true, disableUrlAccess: true,
};

test('Resend can be selected without SMTP while an explicitly disabled worker stays disabled', () => {
  const config = readEmailConfiguration({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_only',
    RESEND_FROM_ADDRESS: 'no-reply@la-chef.online', RESEND_FROM_NAME: 'LA Chef', EMAIL_WORKER_ENABLED: 'false' }) as any;
  assert.equal(config.smtp, undefined);
  assert.equal(config.resend.apiKey, 're_test_only');
  assert.deepEqual(config.resend.from, message.from);
  assert.equal(config.worker.enabled, false);
  assert.equal(readEmailConfiguration({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_only',
    RESEND_FROM_ADDRESS: 'no-reply@la-chef.online' }).worker.enabled, true);
});

test('Resend fails closed for missing secrets or invalid sender values and rejects unknown transports', () => {
  const complete = { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_only', RESEND_FROM_ADDRESS: 'no-reply@la-chef.online' };
  for (const override of [
    { RESEND_API_KEY: '' }, { RESEND_API_KEY: 'bad\nkey' }, { RESEND_FROM_ADDRESS: undefined },
    { RESEND_FROM_ADDRESS: 'bad\r\nBcc:x@example.test' }, { RESEND_FROM_NAME: 'Bad\nName' },
  ]) assert.throws(() => readEmailConfiguration({ ...complete, ...override }));
  assert.throws(() => readEmailConfiguration({ EMAIL_TRANSPORT: 'unknown' }));
});

test('Resend submits only rendered email over HTTPS with an idempotency key and bounded timeout', async () => {
  const calls: { url: unknown; options: RequestInit }[] = [];
  const mailer = transport((async (url, options) => {
    calls.push({ url, options: options! });
    return Response.json({ id: 'provider-email-id' });
  }) as typeof fetch);
  await mailer.sendMail({ ...message, attachments: [{ path: '/private/file' }] });
  await mailer.sendMail({ ...message, from: { ...message.from, name: 'Updated sender name' } });
  assert.equal(calls[0]!.url, 'https://api.resend.com/emails');
  assert.equal(calls[0]!.options.method, 'POST');
  assert.equal(new Headers(calls[0]!.options.headers).get('Authorization'), 'Bearer re_test_only');
  assert.ok(new Headers(calls[0]!.options.headers).get('Idempotency-Key'));
  assert.equal(new Headers(calls[0]!.options.headers).get('Idempotency-Key'), new Headers(calls[1]!.options.headers).get('Idempotency-Key'));
  assert.ok(calls[0]!.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(String(calls[0]!.options.body)), {
    from: '"LA Chef" <no-reply@la-chef.online>', to: ['customer@example.test'], subject: message.subject, text: message.text, html: message.html,
  });
});

for (const [status, expectedCode] of [[409, 'ECONNECTION'], [429, 'ECONNECTION'], [503, 'ECONNECTION'], [401, 'EAUTH'], [422, 'EENVELOPE']] as const) {
  test(`Resend HTTP ${status} maps to safe worker error ${expectedCode}`, async () => {
    const mailer = transport((async () => Response.json({ message: 'sensitive provider detail' }, { status })) as typeof fetch);
    await assert.rejects(mailer.sendMail(message), (error: any) => {
      assert.equal(error.code, expectedCode);
      assert.equal(String(error).includes('sensitive provider detail'), false);
      assert.equal(String(error).includes('re_test_only'), false);
      return true;
    });
  });
}

test('Resend network failures and malformed success responses never count as successful delivery', async () => {
  for (const fetcher of [
    async () => { throw new Error('request contained a private recipient and API key'); },
    async () => Response.json({}),
  ]) {
    const mailer = transport(fetcher as typeof fetch);
    await assert.rejects(mailer.sendMail(message), (error: any) => {
      assert.equal(error.code, 'ECONNECTION');
      assert.equal(String(error).includes('private recipient'), false);
      return true;
    });
  }
});
