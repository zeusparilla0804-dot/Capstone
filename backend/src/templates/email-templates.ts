import type { EmailTemplateKey, RenderedEmail } from '../types/notification.types.js';
import { AppError } from '../utils/app-error.js';

const brand = 'LA Chef Event Catering Services';
const templates: Record<EmailTemplateKey, { subject: string; message: string; extra?: string }> = {
  BOOKING_RECEIVED: { subject: 'Booking received', message: 'We received your booking request. It is pending review.' },
  BOOKING_APPROVED: { subject: 'Booking approved', message: 'Your booking has been approved. Please check your booking for the next payment steps.' },
  BOOKING_REJECTED: { subject: 'Booking request rejected', message: 'Your booking request has been rejected. Please check your booking or contact LA Chef for details.' },
  INVOICE_ISSUED: { subject: 'Invoice issued', message: 'Your invoice is available. Please review it in your account.', extra: 'invoiceNumber' },
  PAYMENT_PROOF_SUBMITTED: { subject: 'Payment proof received', message: 'Your payment proof was received for manual verification. Your recorded balance will change only after verification.' },
  PAYMENT_PROOF_VERIFIED: { subject: 'Payment proof verified', message: 'Your payment proof has been manually verified and the verified amount recorded against your booking.', extra: 'amount' },
  PAYMENT_PROOF_REJECTED: { subject: 'Payment proof rejected', message: 'Your payment proof was rejected. Please check your booking for details and submit a replacement when required.' },
  PAYMENT_RECORDED: { subject: 'Payment recorded', message: 'A manually received payment was recorded against your booking.', extra: 'amount' },
  BOOKING_CONFIRMED: { subject: 'Booking confirmed', message: 'Your booking is confirmed. We look forward to catering your event.' },
  BOOKING_CANCELLED: { subject: 'Booking cancelled', message: 'Your booking has been cancelled. Please check your booking or contact LA Chef for details.' },
  BOOKING_RESCHEDULED: { subject: 'Booking rescheduled', message: 'Your booking has been rescheduled. Please review your event details.' },
  BOOKING_COMPLETED: { subject: 'Booking completed', message: 'Your booking is completed. Thank you for choosing LA Chef.' },
  PASSWORD_RESET_REQUESTED: { subject: 'Reset your password', message: 'Password reset delivery requires the protected renderer.' },
  PASSWORD_CHANGED: { subject: 'Password changed', message: 'Your LA Chef account password was changed. If this was not you, contact LA Chef immediately.' }
};

export function validateEmailPayload(key: unknown, raw: unknown): Record<string, string> {
  if (typeof key !== 'string' || !Object.hasOwn(templates, key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'Invalid notification template or payload.');
  }
  const definition = templates[key as EmailTemplateKey];
  if (key === 'PASSWORD_RESET_REQUESTED') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => !['displayName', 'selector', 'principalType'].includes(field)) ||
        typeof payload.displayName !== 'string' || !payload.displayName.trim() || payload.displayName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.displayName) ||
        typeof payload.selector !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.selector) ||
        (payload.principalType !== 'CUSTOMER' && payload.principalType !== 'ADMIN')) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { displayName: payload.displayName.trim(), selector: payload.selector, principalType: payload.principalType };
  }
  if (key === 'PASSWORD_CHANGED') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => field !== 'displayName') || typeof payload.displayName !== 'string' ||
        !payload.displayName.trim() || payload.displayName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.displayName)) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { displayName: payload.displayName.trim() };
  }
  const keys = ['customerName', 'bookingReference', 'eventDate', ...(definition.extra ? [definition.extra] : [])];
  const payload = raw as Record<string, unknown>;
  if (Object.keys(payload).some(field => !keys.includes(field))) throw new AppError(400, 'Notification payload contains unsupported fields.');
  const result: Record<string, string> = {};
  for (const field of keys) {
    const value = payload[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    result[field] = value.trim();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.eventDate!) ||
      (result.amount !== undefined && !/^\d{1,10}\.\d{2}$/.test(result.amount))) throw new AppError(400, 'Invalid notification date or amount.');
  return result;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function renderEmail(key: EmailTemplateKey, raw: unknown): RenderedEmail {
  const payload = validateEmailPayload(key, raw);
  if (key === 'PASSWORD_RESET_REQUESTED') {
    throw new AppError(404, 'Password reset notification preview is unavailable.');
  }
  const definition = templates[key];
  if (key === 'PASSWORD_CHANGED') {
    const lines = [`Hello ${payload.displayName},`, definition.message, brand];
    return { subject: `${definition.subject} | LA Chef`, text: lines.join('\n\n'),
      html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') };
  }
  const lines = [`Hello ${payload.customerName},`, definition.message, `Booking: ${payload.bookingReference}`,
    `Event date: ${payload.eventDate}`];
  if (key === 'INVOICE_ISSUED') lines.push(`Invoice: ${payload.invoiceNumber}`);
  if (key === 'PAYMENT_PROOF_VERIFIED') lines.push(`Verified amount: PHP ${payload.amount}`);
  if (key === 'PAYMENT_RECORDED') lines.push(`Recorded amount: PHP ${payload.amount}`);
  lines.push(brand);
  return { subject: `${definition.subject} | LA Chef`, text: lines.join('\n\n'),
    html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') };
}
