import type sql from 'mssql';
import { environment, validEmailAddress } from '../config/environment.js';
import {
  emailOutboxRepository,
  type BookingNotificationContext,
  type EmailOutboxRepository
} from '../repositories/email-outbox.repository.js';
import { renderEmail, validateEmailPayload } from '../templates/email-templates.js';
import type { EmailTemplateKey, QueueNotificationInput, RenderedEmail } from '../types/notification.types.js';
import { AppError } from '../utils/app-error.js';

const maxBigInt = 9_223_372_036_854_775_807n;

function bigintId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9]\d*$/.test(value)) throw new AppError(400, 'Invalid notification identifier.');
  const parsed = BigInt(value);
  if (parsed > maxBigInt) throw new AppError(400, 'Invalid notification identifier.');
  return value;
}

function queueInput(raw: QueueNotificationInput): QueueNotificationInput {
  if (!raw || typeof raw !== 'object') throw new AppError(400, 'Invalid notification.');
  if (typeof raw.recipient !== 'string') throw new AppError(400, 'Invalid notification recipient.');
  const recipient = raw.recipient.trim();
  if (!validEmailAddress(recipient)) throw new AppError(400, 'Invalid notification recipient.');
  const paired = raw.relatedEntityType !== undefined && raw.relatedEntityId !== undefined;
  if ((raw.relatedEntityType === undefined) !== (raw.relatedEntityId === undefined) ||
      (raw.relatedEntityType !== undefined && !['BOOKING', 'INVOICE', 'PAYMENT_PROOF', 'CUSTOM_EVENT_REQUEST'].includes(raw.relatedEntityType))) {
    throw new AppError(400, 'Invalid notification relation.');
  }
  return {
    recipient,
    templateKey: raw.templateKey,
    payload: validateEmailPayload(raw.templateKey, raw.payload),
    relatedEntityType: paired ? raw.relatedEntityType : undefined,
    relatedEntityId: paired ? bigintId(raw.relatedEntityId) : undefined
  };
}

export function createNotificationService(deps: { repository: EmailOutboxRepository; nodeEnv: string }) {
  return {
    async queueNotification(input: QueueNotificationInput, request?: sql.Request): Promise<string> {
      return deps.repository.insert(queueInput(input), request);
    },
    async renderEmailPreview(outboxId: string): Promise<RenderedEmail> {
      if (deps.nodeEnv === 'production') throw new AppError(404, 'Notification preview is unavailable.');
      const record = await deps.repository.findById(bigintId(outboxId));
      if (!record) throw new AppError(404, 'Notification not found.');
      if (record.templateKey === 'PASSWORD_RESET_REQUESTED') {
        throw new AppError(404, 'Notification preview is unavailable.');
      }
      return renderEmail(record.templateKey, record.payload);
    },
    bookingContext(reservationId: number, request: sql.Request): Promise<BookingNotificationContext | undefined> {
      return deps.repository.bookingContext(reservationId, request);
    }
  };
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
export const notificationService = createNotificationService({ repository: emailOutboxRepository, nodeEnv });
export const queueNotification = notificationService.queueNotification;
export const renderEmailPreview = notificationService.renderEmailPreview;

export async function queueBookingNotification(
  reservationId: number,
  templateKey: EmailTemplateKey,
  request: sql.Request,
  additions: Record<string, string> = {},
  relatedEntityType: QueueNotificationInput['relatedEntityType'] = 'BOOKING',
  relatedEntityId = String(reservationId)
): Promise<string> {
  const context = await notificationService.bookingContext(reservationId, request);
  if (!context) throw new AppError(404, 'Booking notification context not found.');
  return queueNotification({
    recipient: context.customerEmail,
    templateKey,
    payload: {
      customerName: context.customerName,
      bookingReference: context.bookingReference,
      eventDate: context.eventDate,
      ...(templateKey === 'INVOICE_ISSUED' && context.invoiceNumber ? { invoiceNumber: context.invoiceNumber } : {}),
      ...additions
    },
    relatedEntityType,
    relatedEntityId
  }, request);
}

type CustomEventTemplateKey = Extract<EmailTemplateKey,
  | 'CUSTOM_REQUEST_RECEIVED'
  | 'CUSTOM_REQUEST_RECEIVED_ADMIN'
  | 'CUSTOM_CLARIFICATION_REQUESTED'
  | 'CUSTOM_QUOTE_SENT'
  | 'CUSTOM_QUOTE_ACCEPTED'
  | 'CUSTOM_QUOTE_DECLINED'
  | 'CUSTOM_QUOTE_EXPIRED'>;

export function customEventActionUrl(requestId: number, admin: boolean): string {
  if (!Number.isSafeInteger(requestId) || requestId < 1) throw new AppError(400, 'Invalid custom event request identifier.');
  return new URL(admin ? `/admin/custom-events/${requestId}` : `/custom-events/${requestId}`, environment.frontendOrigin).toString();
}

export async function queueCustomEventNotification(
  reservationId: number,
  requestId: number,
  templateKey: Exclude<CustomEventTemplateKey, 'CUSTOM_REQUEST_RECEIVED_ADMIN'>,
  request: sql.Request,
  additions: Record<string, string> = {},
): Promise<string> {
  const context = await notificationService.bookingContext(reservationId, request);
  if (!context) throw new AppError(404, 'Booking notification context not found.');
  return queueNotification({
    recipient: context.customerEmail,
    templateKey,
    payload: { customerName: context.customerName, bookingReference: context.bookingReference,
      eventDate: context.eventDate, ...additions, actionUrl: customEventActionUrl(requestId, false) },
    relatedEntityType: 'CUSTOM_EVENT_REQUEST',
    relatedEntityId: String(requestId),
  }, request);
}

export async function queueCustomEventReceipt(
  reservationId: number,
  requestId: number,
  request: sql.Request,
): Promise<void> {
  const context = await notificationService.bookingContext(reservationId, request);
  if (!context) throw new AppError(404, 'Booking notification context not found.');
  await queueNotification({ recipient: context.customerEmail, templateKey: 'CUSTOM_REQUEST_RECEIVED',
    payload: { customerName: context.customerName, bookingReference: context.bookingReference,
      eventDate: context.eventDate, actionUrl: customEventActionUrl(requestId, false) },
    relatedEntityType: 'CUSTOM_EVENT_REQUEST', relatedEntityId: String(requestId) }, request);
  for (const recipient of await emailOutboxRepository.activeAdminEmails(request)) {
    await queueNotification({ recipient, templateKey: 'CUSTOM_REQUEST_RECEIVED_ADMIN',
      payload: { customerName: 'LA Chef team', bookingReference: context.bookingReference,
        eventDate: context.eventDate, actionUrl: customEventActionUrl(requestId, true) },
      relatedEntityType: 'CUSTOM_EVENT_REQUEST', relatedEntityId: String(requestId) }, request);
  }
}
