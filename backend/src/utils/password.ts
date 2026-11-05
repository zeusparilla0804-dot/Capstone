import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, 5);
  return `scrypt$v1$16384$8$5$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const legacy = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  const current = /^scrypt\$v1\$16384\$8\$5\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  const match = current ?? legacy;
  if (!match || password.length > 128) return false;
  const saltHex = match[1]!; const hashHex = match[2]!;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'), current ? 5 : 1);
  // Equalize legacy-account verification work with the current p=5 and dummy hashes.
  if (legacy) await derive(password, Buffer.from(saltHex, 'hex'), 4);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function derive(password: string, salt: Buffer, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, 64,
    { N: 16384, r: 8, p, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
