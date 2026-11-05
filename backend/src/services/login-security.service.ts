import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

export type LoginRole = 'CUSTOMER' | 'ADMIN';
export interface SecurityEvent {
  role: LoginRole;
  principalId?: number;
  subjectHash: string;
  ipHash?: string;
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGIN_THROTTLED' | 'LOGOUT' | 'LOGOUT_ALL' | 'PASSWORD_RESET';
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function throttleKey(role: LoginRole, id: number | undefined, identity: string): string {
  return digest(`${role}:${id === undefined ? `identity:${identity.trim().toLowerCase()}` : `id:${id}`}`);
}

interface LoginSecurityDependencies {
  takeAttempt(key: string): Promise<boolean>;
  clearAttempts(key: string): Promise<void>;
  recordEvent(event: SecurityEvent): Promise<void>;
  verify(password: string, storedHash: string): Promise<boolean>;
  dummyHash(): Promise<string>;
}
export function createLoginSecurity(deps: LoginSecurityDependencies) {
  return {
    async authenticate(input: { role: LoginRole; principalId?: number; identity: string; password: string; passwordHash?: string; ip?: string }) {
      const key = throttleKey(input.role, input.principalId, input.identity);
      const event = { role: input.role, principalId: input.principalId, subjectHash: key,
        ipHash: input.ip ? digest(input.ip) : undefined };
      if (!await deps.takeAttempt(key)) {
        await deps.recordEvent({ ...event, event: 'LOGIN_THROTTLED' });
        throw new AppError(429, 'Too many sign-in attempts. Please try again in 15 minutes.', 'LOGIN_COOLDOWN');
      }
      // Warm up the same dummy hash for existing and unknown accounts alike.
      const dummyHash = await deps.dummyHash();
      const valid = await deps.verify(input.password, input.passwordHash ?? dummyHash);
      if (!valid || input.principalId === undefined) {
        await deps.recordEvent({ ...event, event: 'LOGIN_FAILED' });
        throw new AppError(401, input.role === 'ADMIN' ? 'Invalid administrator credentials.' : 'Invalid email or password.');
      }
      await deps.clearAttempts(key);
      // The caller records success only after its credential-checked session INSERT succeeds.
      return { ...event, event: 'LOGIN_SUCCESS' as const };
    },
  };
}
