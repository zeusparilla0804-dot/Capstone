import { environment } from '../config/environment.js';
import {
  passwordRecoveryRepository,
  type PasswordRecoveryRepository,
} from '../repositories/password-recovery.repository.js';
import { queueNotification } from './notification.service.js';
import type { PasswordResetNotificationQueue } from '../types/password-recovery.types.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';
import {
  createPasswordResetToken,
  validatePasswordResetToken,
  type PasswordResetPrincipal,
} from '../utils/password-reset-token.js';

interface PasswordRecoveryDependencies {
  repository: PasswordRecoveryRepository;
  hmacSecret?: string;
  ttlMs: number;
  cooldownMs: number;
  now: () => Date;
  hashPassword: (password: string) => Promise<string>;
  createToken?: typeof createPasswordResetToken;
  queueNotification: PasswordResetNotificationQueue;
}

function invalidToken(): AppError {
  return new AppError(400, 'This password reset link is invalid. Request a new link and try again.', 'PASSWORD_RESET_INVALID');
}

export function createPasswordRecoveryService(deps: PasswordRecoveryDependencies) {
  return {
    async request(principalType: PasswordResetPrincipal, email: string): Promise<void> {
      if (!deps.hmacSecret) return;
      const principal = await deps.repository.findPrincipal(principalType, email.trim().toLowerCase());
      if (!principal) return;

      const token = (deps.createToken ?? createPasswordResetToken)(principalType, deps.hmacSecret);
      const now = deps.now();
      await deps.repository.issue({
        principal,
        selector: token.selector,
        tokenHash: token.tokenHash,
        now,
        expiresAt: new Date(now.getTime() + deps.ttlMs),
        cooldownMs: deps.cooldownMs,
      }, deps.queueNotification);
    },

    async reset(principalType: PasswordResetPrincipal, token: string, password: string, confirmation: string): Promise<void> {
      if (password.length < 12 || password.length > 128) {
        throw new AppError(400, 'Password must be between 12 and 128 characters.');
      }
      if (password !== confirmation) throw new AppError(400, 'Passwords do not match.');
      if (!deps.hmacSecret) throw invalidToken();

      const validated = validatePasswordResetToken(token, principalType, deps.hmacSecret);
      if (!validated) throw invalidToken();
      const passwordHash = await deps.hashPassword(password);
      const result = await deps.repository.consume({
        principalType,
        selector: validated.selector,
        tokenHash: validated.tokenHash,
        passwordHash,
        now: deps.now(),
      }, deps.queueNotification);
      if (result !== 'CONSUMED') throw invalidToken();
    },
  };
}

export const passwordRecoveryService = createPasswordRecoveryService({
  repository: passwordRecoveryRepository,
  hmacSecret: environment.passwordReset.hmacSecret,
  ttlMs: environment.passwordReset.ttlMs,
  cooldownMs: environment.passwordReset.cooldownMs,
  now: () => new Date(),
  hashPassword,
  queueNotification,
});
