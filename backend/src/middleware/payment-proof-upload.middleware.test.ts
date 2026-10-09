import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { readdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

const uploadRoot = await mkdtemp(path.join(tmpdir(), 'proof-middleware-'));
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.DB_SERVER = 'localhost';
process.env.DB_DATABASE = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.PAYMENT_PROOF_UPLOAD_ROOT = uploadRoot;

const [{ paymentProofUpload, registerTemporaryProofCleanup }, { errorHandler }] = await Promise.all([
  import('./payment-proof-upload.middleware.js'),
  import('./error.middleware.js')
]);

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00
]);

async function withServer(
  handler: express.RequestHandler,
  run: (url: string) => Promise<void>
): Promise<void> {
  const app = express();
  app.post('/proof', paymentProofUpload, handler);
  app.use(errorHandler);
  const server: Server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}/proof`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function postFile(
  url: string,
  files: Array<{ field?: string; bytes: Buffer; name: string; type: string }>
): Promise<Response> {
  const form = new FormData();
  for (const file of files) {
    form.append(file.field ?? 'proof', new Blob([file.bytes], { type: file.type }), file.name);
  }
  return fetch(url, { method: 'POST', body: form });
}

async function tempFiles(): Promise<string[]> {
  const directory = path.join(uploadRoot, '.tmp');
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

test('maps declared MIME mismatch to 400 and removes the temporary upload', async () => {
  await withServer((_request, response) => response.sendStatus(204), async (url) => {
    const response = await postFile(url, [{ bytes: png, name: 'proof.png', type: 'image/jpeg' }]);
    assert.equal(response.status, 400);
    assert.deepEqual(await tempFiles(), []);
  });
});

test('maps an unsupported filename extension to 400 and removes the temporary upload', async () => {
  await withServer((_request, response) => response.sendStatus(204), async (url) => {
    const response = await postFile(url, [{ bytes: png, name: 'proof.gif', type: 'image/png' }]);
    assert.equal(response.status, 400);
    assert.deepEqual(await tempFiles(), []);
  });
});

test('maps Multer file-size rejection to 413 and cleans temporary data', async () => {
  await withServer((_request, response) => response.sendStatus(204), async (url) => {
    const response = await postFile(url, [{
      bytes: Buffer.alloc(5_242_881),
      name: 'large.png',
      type: 'image/png'
    }]);
    assert.equal(response.status, 413);
    assert.deepEqual(await tempFiles(), []);
  });
});

test('maps an unexpected multipart field to 400 and leaves no temporary file', async () => {
  await withServer((_request, response) => response.sendStatus(204), async (url) => {
    const response = await postFile(url, [{ field: 'receipt', bytes: png, name: 'proof.png', type: 'image/png' }]);
    assert.equal(response.status, 400);
    assert.deepEqual(await tempFiles(), []);
  });
});

test('maps multiple proof files to 400 and cleans every temporary file', async () => {
  await withServer((_request, response) => response.sendStatus(204), async (url) => {
    const response = await postFile(url, [
      { bytes: png, name: 'first.png', type: 'image/png' },
      { bytes: png, name: 'second.png', type: 'image/png' }
    ]);
    assert.equal(response.status, 400);
    assert.deepEqual(await tempFiles(), []);
  });
});

test('removes an unconsumed validated upload after a downstream error response', async () => {
  await withServer((_request, _response, next) => next(new Error('downstream failure')), async (url) => {
    const response = await postFile(url, [{ bytes: png, name: 'proof.png', type: 'image/png' }]);
    assert.equal(response.status, 500);
    await waitFor(async () => (await tempFiles()).length === 0, 'Temporary upload was not removed.');
    assert.deepEqual(await tempFiles(), []);
  });
});

test('uses mode 0600 for a validated temporary upload where POSIX modes are supported', {
  skip: process.platform === 'win32'
}, async () => {
  await withServer(async (request, response) => {
    const mode = (await stat(request.validatedPaymentProof!.path)).mode & 0o777;
    response.status(200).json({ mode });
  }, async (url) => {
    const response = await postFile(url, [{ bytes: png, name: 'proof.png', type: 'image/png' }]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: 0o600 });
  });
});

test('cleanup lifecycle removes temporary files on request abort and response error or close', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-lifecycle-'));
  for (const event of ['aborted', 'error', 'close'] as const) {
    const filePath = path.join(directory, `${event}.tmp`);
    await writeFile(filePath, png, { mode: 0o600 });
    const request = new EventEmitter();
    const response = new EventEmitter();
    registerTemporaryProofCleanup(request, response, filePath, directory);
    (event === 'aborted' ? request : response).emit(event, new Error('connection failed'));
    await waitFor(async () => {
      try { await stat(filePath); return false; }
      catch { return true; }
    }, `Temporary file was not removed after ${event}.`);
    await assert.rejects(stat(filePath));
  }
});
