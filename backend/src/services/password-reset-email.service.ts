import { environment } from '../config/environment.js';
import type { ClaimedEmail } from '../repositories/email-outbox.repository.js';
import { passwordRecoveryRepository } from '../repositories/password-recovery.repository.js';
import { renderPasswordResetRequestedEmail, validateEmailPayload } from '../templates/email-templates.js';
import type { RenderedEmail } from '../types/notification.types.js';
import { reconstructPasswordResetToken, type PasswordResetPrincipal } from '../utils/password-reset-token.js';

interface DeliverabilityRepository {
  isDeliverable(selector: string, principalType: PasswordResetPrincipal, now: Date, recipient: string): Promise<boolean>;
}

interface PasswordResetEmailDependencies {
  repository: DeliverabilityRepository;
  hmacSecret?: string;
  frontendOrigin: string;
}

export function createPasswordResetEmailService(deps: PasswordResetEmailDependencies) {
  return {
    async renderPasswordResetEmail(item: ClaimedEmail, now: Date): Promise<RenderedEmail | undefined> {
      if (item.templateKey !== 'PASSWORD_RESET_REQUESTED' || !deps.hmacSecret) return undefined;
      const payload = validateEmailPayload(item.templateKey, item.payload);
      const accountType = payload.accountType as PasswordResetPrincipal;
      if (!await deps.repository.isDeliverable(payload.selector!, accountType, now, item.recipient)) return undefined;

      const token = reconstructPasswordResetToken(payload.selector!, accountType, deps.hmacSecret);
      const route = accountType === 'ADMIN' ? '/admin/reset-password' : '/reset-password';
      const url = new URL(route, deps.frontendOrigin);
      // Fragments are never sent in HTTP requests or Referer headers.
      url.hash = new URLSearchParams({ token }).toString();
      return renderPasswordResetRequestedEmail(payload.accountName!, url.toString());
    },
  };
}

const passwordResetEmailService = createPasswordResetEmailService({
  repository: passwordRecoveryRepository,
  hmacSecret: environment.passwordReset.hmacSecret,
  frontendOrigin: environment.frontendOrigin,
});

export const renderPasswordResetEmail = passwordResetEmailService.renderPasswordResetEmail;
