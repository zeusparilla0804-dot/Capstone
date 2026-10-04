import { createHash, randomBytes } from 'node:crypto';
export const SESSION_COOKIE = 'la_chef_session';
export const ADMIN_SESSION_COOKIE = 'la_chef_admin_session';
export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function hashSessionToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function readCookie(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1];
}
