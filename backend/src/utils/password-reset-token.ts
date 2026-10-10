import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type PasswordResetPrincipal = 'CUSTOMER' | 'ADMIN';

const selectorPattern = /^[A-Za-z0-9_-]{22}$/;
const tokenPattern = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

function createProof(selector: string, principal: PasswordResetPrincipal, secret: string): string {
  return createHmac('sha256', secret)
    .update(`v1:${principal}:${selector}`)
    .digest('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function reconstructPasswordResetToken(
  selector: string,
  principal: PasswordResetPrincipal,
  secret: string,
): string {
  if (!selectorPattern.test(selector)) {
    throw new TypeError('Password reset selector is invalid.');
  }

  return `${selector}.${createProof(selector, principal, secret)}`;
}

export function createPasswordResetToken(principal: PasswordResetPrincipal, secret: string) {
  const selector = randomBytes(16).toString('base64url');
  const token = reconstructPasswordResetToken(selector, principal, secret);

  return {
    selector,
    token,
    tokenHash: hashToken(token),
  };
}

export function validatePasswordResetToken(
  token: string,
  principal: PasswordResetPrincipal,
  secret: string,
): { selector: string; tokenHash: string } | undefined {
  const match = tokenPattern.exec(token);
  if (!match) return undefined;

  const selector = match[1]!;
  const expectedToken = reconstructPasswordResetToken(selector, principal, secret);
  const supplied = Buffer.from(token, 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return undefined;

  return { selector, tokenHash: hashToken(token) };
}
