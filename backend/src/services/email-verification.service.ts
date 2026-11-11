import type sql from 'mssql';
import { environment } from '../config/environment.js';
import { emailVerificationRepository, type VerificationQueue } from '../repositories/email-verification.repository.js';
import { createEmailCodeChallenge, emailCode, emailCodeHash } from '../utils/email-verification-code.js';
import { AppError } from '../utils/app-error.js';
import type { ClaimedEmail } from '../repositories/email-outbox.repository.js';
import { renderEmailVerificationCode, validateEmailPayload } from '../templates/email-templates.js';
import { queueNotification } from './notification.service.js';

export function createEmailVerificationService(deps: {
  repository: typeof emailVerificationRepository; secret?: string; smtpConfigured: boolean;
  queue: VerificationQueue; now(): Date;
}) {
  function configured(requireDelivery = false): string {
    if (!deps.secret || (requireDelivery && !deps.smtpConfigured)) throw new AppError(503, 'Email verification is temporarily unavailable. Please try again later.', 'EMAIL_VERIFICATION_UNAVAILABLE');
    return deps.secret;
  }
  return {
    async requestCode(email: string, request?: sql.Request, queue: VerificationQueue = deps.queue): Promise<void> {
      const secret = configured(true), now = deps.now();
      const challenge = createEmailCodeChallenge(secret, email);
      const issued = await deps.repository.issue({ ...challenge, email, now, expiresAt: new Date(+now + 600_000) }, queue, request);
      if (request && !issued) throw new Error('New registration could not issue its verification challenge.');
    },
    async verify(email: string, code: string): Promise<void> {
      const secret = configured();
      if (!/^\d{6}$/.test(code) || !await deps.repository.consume(email, code, secret, deps.now(), deps.queue)) {
        throw new AppError(400, 'Unable to verify this code. Check the code or request a new one. After several attempts, wait 15 minutes.', 'EMAIL_VERIFICATION_INVALID');
      }
    },
    async renderCode(item: ClaimedEmail, now: Date) {
      if (item.templateKey !== 'EMAIL_VERIFICATION_CODE' || !deps.secret) return undefined;
      const payload = validateEmailPayload(item.templateKey, item.payload);
      const code = emailCode(payload.selector!, deps.secret);
      const proof = emailCodeHash(payload.selector!, item.recipient, code, deps.secret);
      if (!await deps.repository.isDeliverable(payload.selector!, item.recipient, now, proof)) return undefined;
      return renderEmailVerificationCode(payload.accountName!, code);
    },
  };
}
export const emailVerificationService = createEmailVerificationService({ repository: emailVerificationRepository,
  secret: environment.emailVerificationSecret, smtpConfigured: Boolean(environment.email.smtp || environment.email.resend) && environment.email.worker.enabled,
  queue: queueNotification, now: () => new Date() });
