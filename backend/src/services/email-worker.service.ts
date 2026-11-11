import nodemailer from 'nodemailer';
import { environment } from '../config/environment.js';
import {
  emailOutboxRepository,
  type ClaimedEmail,
  type EmailOutboxRepository
} from '../repositories/email-outbox.repository.js';
import { renderEmail } from '../templates/email-templates.js';
import type { BatchResult, EmailTemplateKey, EmailWorkerSettings } from '../types/notification.types.js';
import { logger } from '../utils/logger.js';
import { renderPasswordResetEmail } from './password-reset-email.service.js';
import { renderUpcomingEventReminder } from './event-reminder.service.js';
import { emailVerificationService } from './email-verification.service.js';
import { createResendTransport } from './resend-transport.js';

interface MailTransport {
  sendMail(message: Record<string, unknown>): Promise<{ rejected?: unknown[] } | unknown>;
  close?: () => void;
}

interface WorkerDependencies {
  repository: EmailOutboxRepository;
  transport?: MailTransport;
  settings: EmailWorkerSettings;
  from: { name: string; address: string };
  renderPasswordResetEmail: (item: ClaimedEmail, now: Date) => Promise<ReturnType<typeof renderEmail> | undefined>;
  renderUpcomingEventReminder: (item: ClaimedEmail, now: Date) => Promise<ReturnType<typeof renderEmail> | undefined>;
  renderEmailVerificationCode?: (item: ClaimedEmail, now: Date) => Promise<ReturnType<typeof renderEmail> | undefined>;
}

const retiredCustomQuotationTemplates = new Set<EmailTemplateKey>([
  'CUSTOM_REQUEST_RECEIVED',
  'CUSTOM_REQUEST_RECEIVED_ADMIN',
  'CUSTOM_CLARIFICATION_REQUESTED',
  'CUSTOM_QUOTE_SENT',
  'CUSTOM_QUOTE_ACCEPTED',
  'CUSTOM_QUOTE_DECLINED',
  'CUSTOM_QUOTE_EXPIRED',
]);

function failureDetails(error: unknown): { transient: boolean; summary: string } {
  const value = error as { code?: unknown; responseCode?: unknown };
  const code = typeof value?.code === 'string' ? value.code.replace(/[^A-Z0-9_-]/gi, '').slice(0, 40) : undefined;
  const responseCode = typeof value?.responseCode === 'number' ? value.responseCode : undefined;
  const permanentCodes = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE']);
  const transientCodes = new Set(['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ESOCKET']);
  const transient = responseCode !== undefined ? responseCode >= 400 && responseCode < 500 : !!code && transientCodes.has(code);
  const safeCode = code && (transientCodes.has(code) || permanentCodes.has(code)) ? code : 'DELIVERY_ERROR';
  const smtp = responseCode !== undefined && responseCode >= 400 && responseCode <= 599 ? ` SMTP ${responseCode}` : '';
  return { transient: transient && !permanentCodes.has(safeCode), summary: `${safeCode}${smtp}`.slice(0, 200) };
}

export function createEmailWorker(deps: WorkerDependencies) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let started = false;
  let stopping = false;

  async function processEmailBatch(now: Date): Promise<BatchResult> {
    const result: BatchResult = { disabled: !deps.transport || !deps.settings.enabled, claimed: 0, sent: 0, retried: 0, failed: 0 };
    if (result.disabled) return result;
    const transport = deps.transport!;
    const priority = (item: ClaimedEmail) => item.templateKey === 'EMAIL_VERIFICATION_CODE' || item.templateKey === 'PASSWORD_RESET_REQUESTED' ? 0 : 1;
    // UPDATE ... OUTPUT does not guarantee the order selected by the claim query.
    const claimed = (await deps.repository.claim(now, deps.settings)).sort((a, b) => priority(a) - priority(b) || +new Date(a.createdAt) - +new Date(b.createdAt));
    result.claimed = claimed.length;
    for (const item of claimed) {
      if (retiredCustomQuotationTemplates.has(item.templateKey)) {
        if (await deps.repository.finish(item, { status: 'FAILED', error: 'CUSTOM_QUOTATION_RETIRED' }, now)) result.failed++;
        continue;
      }
      if (item.attemptCount > deps.settings.maxAttempts) {
        if (await deps.repository.finish(item, { status: 'FAILED', error: 'MAX_ATTEMPTS_EXCEEDED' }, now)) result.failed++;
        continue;
      }
      try {
        const rendered = item.templateKey === 'PASSWORD_RESET_REQUESTED'
          ? await deps.renderPasswordResetEmail(item, now)
          : item.templateKey === 'EMAIL_VERIFICATION_CODE'
            ? await deps.renderEmailVerificationCode?.(item, now)
          : item.templateKey === 'UPCOMING_EVENT_REMINDER'
            ? await deps.renderUpcomingEventReminder(item, now)
            : renderEmail(item.templateKey, item.payload);
        if (!rendered) {
          const error = item.templateKey === 'UPCOMING_EVENT_REMINDER'
            ? 'REMINDER_NO_LONGER_APPLICABLE'
            : item.templateKey === 'EMAIL_VERIFICATION_CODE' ? 'VERIFICATION_CODE_UNAVAILABLE' : 'RESET_TOKEN_UNAVAILABLE';
          if (await deps.repository.finish(item, { status: 'FAILED', error }, now)) result.failed++;
          continue;
        }
        const response = await transport.sendMail({
          idempotencyKey: `la-chef-outbox-${item.id}`,
          from: deps.from,
          to: item.recipient,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          disableFileAccess: true,
          disableUrlAccess: true
        });
        if (response && typeof response === 'object' && Array.isArray((response as { rejected?: unknown[] }).rejected) &&
            (response as { rejected: unknown[] }).rejected.length > 0) {
          throw Object.assign(new Error('Recipient rejected.'), { code: 'EENVELOPE' });
        }
        if (await deps.repository.finish(item, { status: 'SENT' }, now)) result.sent++;
      } catch (error) {
        const failure = failureDetails(error);
        if (failure.transient && item.attemptCount < deps.settings.maxAttempts) {
          const multiplier = 2 ** Math.max(0, item.attemptCount - 1);
          const delay = Math.min(deps.settings.retryBaseMs * multiplier, deps.settings.retryCapMs);
          if (await deps.repository.finish(item, { status: 'PENDING', error: failure.summary,
            nextAttemptAt: new Date(now.getTime() + delay) }, now)) result.retried++;
        } else if (await deps.repository.finish(item, { status: 'FAILED', error: failure.summary }, now)) result.failed++;
      }
    }
    return result;
  }

  async function tick(): Promise<void> {
    if (stopping || running) return;
    running = (async () => {
      try { await processEmailBatch(new Date()); }
      catch (error) { logger.error('email_worker.batch_failed', 'Email delivery batch failed safely.'); }
    })();
    try { await running; } finally {
      running = undefined;
      if (!stopping) timer = setTimeout(() => { void tick(); }, deps.settings.pollIntervalMs);
    }
  }

  return {
    processEmailBatch,
    start(): void {
      if (started || !deps.transport || !deps.settings.enabled) return;
      started = true;
      stopping = false;
      void tick();
    },
    async stop(): Promise<void> {
      if (!started) return;
      stopping = true;
      if (timer) clearTimeout(timer);
      await running;
      deps.transport?.close?.();
      started = false;
      timer = undefined;
    }
  };
}

const smtp = environment.email.smtp;
const resend = environment.email.resend;
const transport = resend ? createResendTransport(resend.apiKey) : smtp ? nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: smtp.auth,
  disableFileAccess: true,
  disableUrlAccess: true
}) as MailTransport : undefined;

export const emailWorker = createEmailWorker({
  renderEmailVerificationCode: emailVerificationService.renderCode,
  repository: emailOutboxRepository,
  transport,
  settings: environment.email.worker,
  from: resend?.from ?? smtp?.from ?? { name: 'LA Chef Event Catering Services', address: 'disabled@invalid.local' },
  renderPasswordResetEmail,
  renderUpcomingEventReminder,
});
