import { createHmac, randomBytes } from 'node:crypto';

function hmac(secret: string, value: string): Buffer {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Email verification requires a strong server secret.');
  return createHmac('sha256', secret).update(value).digest();
}
export function emailCode(selector: string, secret: string): string {
  if (!/^[A-Za-z0-9_-]{22}$/.test(selector)) throw new Error('Invalid email challenge selector.');
  return String(hmac(secret, `la-chef/email-code/v1:${selector}`).readUIntBE(0, 6) % 1_000_000).padStart(6, '0');
}
export function emailCodeHash(selector: string, email: string, code: string, secret: string): string {
  if (!/^[A-Za-z0-9_-]{22}$/.test(selector) || !/^\d{6}$/.test(code)) throw new Error('Invalid email code.');
  return hmac(secret, `la-chef/email-code-proof/v1:${selector}:${email.trim().toLowerCase()}:${code}`).toString('hex');
}
export function createEmailCodeChallenge(secret: string, email: string): { selector: string; codeHash: string } {
  const selector = randomBytes(16).toString('base64url');
  return { selector, codeHash: emailCodeHash(selector, email, emailCode(selector, secret), secret) };
}
