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
import { cashDepositDeadline } from './cash-payment-policy.js';
import { requiredReservationDeposit } from './reservation-billing-policy.js';

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
      (raw.relatedEntityType !== undefined && !['CUSTOMER', 'BOOKING', 'INVOICE', 'PAYMENT_PROOF', 'CUSTOM_EVENT_REQUEST'].includes(raw.relatedEntityType))) {
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
      if (record.templateKey === 'PASSWORD_RESET_REQUESTED' || record.templateKey === 'EMAIL_VERIFICATION_CODE') {
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

function invoiceNotificationPayload(context: BookingNotificationContext): Record<string, string> {
  if (!context.invoiceId || context.totalAmount == null || context.amountPaid == null) return {};
  if (!Number.isSafeInteger(context.invoiceId) || context.invoiceId < 1 ||
      !Number.isFinite(context.amountPaid) || context.amountPaid < 0) {
    throw new AppError(500, 'Invoice notification values are invalid.');
  }
  const requiredDeposit = requiredReservationDeposit(context.totalAmount);
  const totalCents = Math.round(context.totalAmount * 100);
  const paidCents = Math.round(context.amountPaid * 100);
  const money = (cents: number) => (cents / 100).toFixed(2);
  const payload: Record<string, string> = {
    invoiceUrl: new URL(`/invoice/${context.invoiceId}`, environment.frontendOrigin).toString(),
    totalAmount: money(totalCents), amountPaid: money(paidCents), requiredDeposit: requiredDeposit.toFixed(2),
    remainingDeposit: money(Math.max(Math.round(requiredDeposit * 100) - paidCents, 0)),
    remainingBalance: money(Math.max(totalCents - paidCents, 0)),
  };
  for (const field of ['invoiceDueDate', 'eventTime'] as const) {
    if (context[field]) payload[field] = context[field];
  }
  for (const field of ['eventType', 'venue'] as const) {
    if (context[field]) payload[field] = context[field].replace(/\s+/gu, ' ').trim();
  }
  if (context.status) payload.bookingStatus = context.status.toUpperCase();
  if (context.paymentMethod) payload.paymentMethod = context.paymentMethod.toUpperCase().replaceAll('-', '_');
  if (context.guestCount) payload.guestCount = String(context.guestCount);
  if (payload.paymentMethod === 'CASH' && context.guestCount) {
    const deadline = cashDepositDeadline(context.eventDate, context.guestCount);
    payload.cashDepositDueDate = deadline.date;
    payload.cashPreparationDays = String(deadline.preparationDays);
  }
  return payload;
}

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
      ...(templateKey === 'BOOKING_APPROVED' && context.paymentMethod?.toUpperCase() === 'CASH' && context.guestCount
        ? { cashPaymentInstructions: `Cash down payment (50%) is due by ${cashDepositDeadline(context.eventDate, context.guestCount).date}, 6:00 PM. Pay at the LA Chef office, open daily 8:00 AM-6:00 PM. Booking remains subject to final confirmation.` }
        : {}),
      ...(templateKey === 'INVOICE_ISSUED' && context.invoiceNumber ? { invoiceNumber: context.invoiceNumber } : {}),
      ...(templateKey === 'INVOICE_ISSUED' ? invoiceNotificationPayload(context) : {}),
      ...additions
    },
    relatedEntityType,
    relatedEntityId
  }, request);
}
