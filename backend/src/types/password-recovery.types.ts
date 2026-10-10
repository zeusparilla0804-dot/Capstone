import type sql from 'mssql';
import type { QueueNotificationInput } from './notification.types.js';
import type { PasswordResetPrincipal } from '../utils/password-reset-token.js';

export interface RecoveryPrincipal {
  id: number;
  principalType: PasswordResetPrincipal;
  email: string;
  displayName: string;
}

export interface PasswordResetIssue {
  principal: RecoveryPrincipal;
  selector: string;
  tokenHash: string;
  now: Date;
  expiresAt: Date;
  cooldownMs: number;
}

export interface PasswordResetConsume {
  principalType: PasswordResetPrincipal;
  selector: string;
  tokenHash: string;
  passwordHash: string;
  now: Date;
}

export type PasswordResetIssueResult = 'ISSUED' | 'COOLDOWN';
export type PasswordResetConsumeResult = 'CONSUMED' | 'INVALID';
export type PasswordResetNotificationQueue = (input: QueueNotificationInput, request: sql.Request) => Promise<string>;
