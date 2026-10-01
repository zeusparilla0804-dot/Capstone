import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  FileSystemProofStorage,
  MAX_PAYMENT_PROOF_BYTES,
  validateProofFile,
  type TemporaryProofFile
} from './proof-storage.service.js';

const signatures = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  png: Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00
  ]),
  webp: Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8 \x0e\x00\x00\x00', 'binary')
} as const;

async function temporaryFile(
  directory: string,
  filename: string,
  content: Buffer,
  declaredMimeType: string
): Promise<TemporaryProofFile> {
  const filePath = path.join(directory, `upload-${crypto.randomUUID()}.tmp`);
  await writeFile(filePath, content);
  return {
    path: filePath,
    originalFilename: filename,
    declaredMimeType,
    byteSize: content.byteLength
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('validates JPEG, PNG, and WebP files from their signatures', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-validation-'));
  const cases = [
    ['photo.jpg', 'image/jpeg', signatures.jpeg, 'jpg'],
    ['photo.png', 'image/png', signatures.png, 'png'],
    ['photo.webp', 'image/webp', signatures.webp, 'webp']
  ] as const;

  for (const [name, mimeType, bytes, extension] of cases) {
    const file = await temporaryFile(directory, name, bytes, mimeType);
    const validated = await validateProofFile(file);
    assert.equal(validated.extension, extension);
    assert.equal(validated.mimeType, mimeType);
    assert.equal(await exists(file.path), true);
  }
});

test('accepts an exact 5 MiB valid proof', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-limit-'));
  const bytes = Buffer.alloc(MAX_PAYMENT_PROOF_BYTES);
  signatures.jpeg.copy(bytes);
  const file = await temporaryFile(directory, 'exact.jpg', bytes, 'image/jpeg');

  const validated = await validateProofFile(file);

  assert.equal(validated.byteSize, MAX_PAYMENT_PROOF_BYTES);
});

test('rejects and deletes a proof one byte over 5 MiB', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-limit-'));
  const bytes = Buffer.alloc(MAX_PAYMENT_PROOF_BYTES + 1);
  signatures.jpeg.copy(bytes);
  const file = await temporaryFile(directory, 'large.jpg', bytes, 'image/jpeg');

  await assert.rejects(validateProofFile(file), /5 MB/i);
  assert.equal(await exists(file.path), false);
});

test('rejects an extension/signature mismatch and deletes the temporary file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-mismatch-'));
  const file = await temporaryFile(directory, 'renamed.png', signatures.jpeg, 'image/png');

  await assert.rejects(validateProofFile(file), /does not match/i);
  assert.equal(await exists(file.path), false);
});

test('rejects random bytes and deletes the temporary file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-random-'));
  const file = await temporaryFile(directory, 'random.png', Buffer.from('not an image'), 'image/png');

  await assert.rejects(validateProofFile(file), /JPEG, PNG, or WebP/i);
  assert.equal(await exists(file.path), false);
});

test('rejects a declared MIME mismatch and deletes the temporary file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-mime-'));
  const file = await temporaryFile(directory, 'photo.jpg', signatures.jpeg, 'image/png');

  await assert.rejects(validateProofFile(file), /does not match/i);
  assert.equal(await exists(file.path), false);
});

test('rejects an unsupported extension and deletes the temporary file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-extension-'));
  const file = await temporaryFile(directory, 'photo.gif', signatures.png, 'image/png');

  await assert.rejects(validateProofFile(file), /does not match/i);
  assert.equal(await exists(file.path), false);
});

test('preserves the primary read error when best-effort cleanup also fails', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'proof-read-failure-'));
  const unreadablePath = path.join(directory, 'directory.png');
  await mkdir(unreadablePath);
  const file: TemporaryProofFile = {
    path: unreadablePath,
    originalFilename: 'directory.png',
    declaredMimeType: 'image/png',
    byteSize: 0
  };

  await assert.rejects(validateProofFile(file), (error: NodeJS.ErrnoException) => {
    assert.notEqual(error.code, 'EPERM');
    assert.doesNotMatch(error.message, /unlink|cleanup/i);
    return true;
  });
  assert.equal(await exists(unreadablePath), true);
});

test('stores with a generated key and preserves the original filename only as metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-store-'));
  const temp = await mkdtemp(path.join(tmpdir(), 'proof-temp-'));
  const file = await temporaryFile(temp, '../../secret.png', signatures.png, 'image/png');
  const validated = await validateProofFile(file);
  const storage = new FileSystemProofStorage(root);

  const stored = await storage.save(validated);

  assert.match(stored.storageKey, /^payment-proofs\/[0-9a-f-]+\.png$/);
  assert.equal(stored.originalFilename, '../../secret.png');
  assert.equal(stored.storageKey.includes('secret'), false);
  assert.deepEqual(await readFile(path.join(root, ...stored.storageKey.split('/'))), signatures.png);
  assert.equal(await exists(file.path), false);
});

test('persists the exact validated bytes even if the temporary pathname changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-store-'));
  const temp = await mkdtemp(path.join(tmpdir(), 'proof-temp-'));
  const file = await temporaryFile(temp, 'proof.png', signatures.png, 'image/png');
  const validated = await validateProofFile(file);
  await writeFile(file.path, Buffer.from('substituted after validation'));

  const stored = await new FileSystemProofStorage(root).save(validated);

  assert.deepEqual(await readFile(path.join(root, ...stored.storageKey.split('/'))), signatures.png);
});

test('preserves the write error even when temporary cleanup also fails', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-store-failure-'));
  const blockingPath = path.join(root, 'payment-proofs');
  await writeFile(blockingPath, 'not a directory');
  const temp = await mkdtemp(path.join(tmpdir(), 'proof-temp-'));
  const file = await temporaryFile(temp, 'proof.png', signatures.png, 'image/png');
  const validated = await validateProofFile(file);
  await unlink(file.path);
  await mkdir(file.path);

  await assert.rejects(new FileSystemProofStorage(root).save(validated), (error: NodeJS.ErrnoException) => {
    assert.ok(error.code === 'EEXIST' || error.code === 'ENOTDIR');
    return true;
  });
  assert.equal(await exists(file.path), true);
});

test('creates private directories and final files where POSIX modes are supported', {
  skip: process.platform === 'win32'
}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-permissions-'));
  const temp = await mkdtemp(path.join(tmpdir(), 'proof-temp-'));
  const file = await temporaryFile(temp, 'proof.png', signatures.png, 'image/png');
  const stored = await new FileSystemProofStorage(root).save(await validateProofFile(file));
  const directoryMode = (await stat(path.join(root, 'payment-proofs'))).mode & 0o777;
  const fileMode = (await stat(path.join(root, ...stored.storageKey.split('/')))).mode & 0o777;

  assert.equal(directoryMode, 0o700);
  assert.equal(fileMode, 0o600);
});

test('opens and deletes a stored proof while rejecting traversal keys', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-store-'));
  const temp = await mkdtemp(path.join(tmpdir(), 'proof-temp-'));
  const storage = new FileSystemProofStorage(root);
  const file = await temporaryFile(temp, 'proof.webp', signatures.webp, 'image/webp');
  const stored = await storage.save(await validateProofFile(file));

  assert.deepEqual(await streamToBuffer(await storage.open(stored.storageKey)), signatures.webp);
  await assert.rejects(storage.open('../../secret.png'), /Invalid storage key/i);
  await assert.rejects(storage.delete('payment-proofs/../secret.png'), /Invalid storage key/i);

  await storage.delete(stored.storageKey);
  await assert.rejects(storage.open(stored.storageKey));
});

test('rejects a non-regular stored path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-non-regular-'));
  const key = 'payment-proofs/123e4567-e89b-42d3-a456-426614174000.png';
  await mkdir(path.join(root, ...key.split('/')), { recursive: true });

  await assert.rejects(new FileSystemProofStorage(root).open(key), /regular file/i);
});

test('rejects symlink substitution and non-regular stored paths where no-follow is supported', {
  skip: process.platform === 'win32'
}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'proof-symlink-'));
  const proofDirectory = path.join(root, 'payment-proofs');
  await mkdir(proofDirectory, { mode: 0o700 });
  const target = path.join(root, 'target.png');
  await writeFile(target, signatures.png);
  const key = 'payment-proofs/123e4567-e89b-42d3-a456-426614174000.png';
  await symlink(target, path.join(root, ...key.split('/')));

  await assert.rejects(new FileSystemProofStorage(root).open(key));
});

