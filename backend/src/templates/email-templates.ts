import type { EmailTemplateKey, RenderedEmail } from '../types/notification.types.js';
import { AppError } from '../utils/app-error.js';

const brand = 'LA Chef Event Catering Services';
const templates: Record<EmailTemplateKey, { subject: string; message: string; extras?: readonly string[] }> = {
  BOOKING_RECEIVED: { subject: 'Booking received', message: 'We received your booking request. It is pending review.' },
  BOOKING_APPROVED: { subject: 'Booking approved', message: 'Your booking has been approved. Please check your booking for the next payment steps.' },
  BOOKING_REJECTED: { subject: 'Booking request rejected', message: 'Your booking request has been rejected. Please check your booking or contact LA Chef for details.' },
  INVOICE_ISSUED: { subject: 'Invoice issued', message: 'Your invoice is available. Please review it in your account.', extras: ['invoiceNumber'] },
  PAYMENT_PROOF_SUBMITTED: { subject: 'Payment proof received', message: 'Your payment proof was received for manual verification. Your recorded balance will change only after verification.' },
  PAYMENT_PROOF_VERIFIED: { subject: 'Payment proof verified', message: 'Your payment proof has been manually verified and the verified amount recorded against your booking.', extras: ['amount'] },
  PAYMENT_PROOF_REJECTED: { subject: 'Payment proof rejected', message: 'Your payment proof was rejected. Please check your booking for details and submit a replacement when required.' },
  PAYMENT_RECORDED: { subject: 'Payment recorded', message: 'A manually received payment was recorded against your booking.', extras: ['amount'] },
  BOOKING_CONFIRMED: { subject: 'Booking confirmed', message: 'Your booking is confirmed. We look forward to catering your event.' },
  BOOKING_CANCELLED: { subject: 'Booking cancelled', message: 'Your booking has been cancelled. Please check your booking or contact LA Chef for details.' },
  BOOKING_RESCHEDULED: { subject: 'Booking rescheduled', message: 'Your booking has been rescheduled. Please review your event details.' },
  BOOKING_COMPLETED: { subject: 'Booking completed', message: 'Your booking is completed. Thank you for choosing LA Chef.' },
  PASSWORD_RESET_REQUESTED: { subject: 'Reset your password', message: 'Password reset delivery requires the protected renderer.' },
  PASSWORD_CHANGED: { subject: 'Password changed', message: 'Your LA Chef account password was changed. If this was not you, contact LA Chef immediately.' },
  CUSTOM_REQUEST_RECEIVED: { subject: 'Custom event request received', message: 'We received your custom event request. Our team will review it and prepare a quotation.', extras: ['actionUrl'] },
  CUSTOM_REQUEST_RECEIVED_ADMIN: { subject: 'New custom event request', message: 'A new custom event request is ready for review.', extras: ['actionUrl'] },
  CUSTOM_CLARIFICATION_REQUESTED: { subject: 'More event details needed', message: 'LA Chef needs a little more information before preparing your quotation.', extras: ['reason', 'actionUrl'] },
  CUSTOM_QUOTE_SENT: { subject: 'Your custom quotation is ready', message: 'Your tailored LA Chef quotation is ready to review.', extras: ['quoteTotal', 'validUntil', 'actionUrl'] },
  CUSTOM_QUOTE_ACCEPTED: { subject: 'Custom quotation accepted', message: 'Your quotation was accepted and payment is now available in your account.', extras: ['quoteTotal', 'actionUrl'] },
  CUSTOM_QUOTE_DECLINED: { subject: 'Custom quotation declined', message: 'Your quotation was declined and the event request has been closed.', extras: ['actionUrl'] },
  CUSTOM_QUOTE_EXPIRED: { subject: 'Custom quotation expired', message: 'Your quotation has expired. Contact LA Chef if you would like a new version.', extras: ['actionUrl'] }
};

export function validateEmailPayload(key: unknown, raw: unknown): Record<string, string> {
  if (typeof key !== 'string' || !Object.hasOwn(templates, key) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'Invalid notification template or payload.');
  }
  const definition = templates[key as EmailTemplateKey];
  if (key === 'PASSWORD_RESET_REQUESTED') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => !['accountName', 'selector', 'accountType'].includes(field)) ||
        typeof payload.accountName !== 'string' || !payload.accountName.trim() || payload.accountName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.accountName) ||
        typeof payload.selector !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.selector) ||
        (payload.accountType !== 'CUSTOMER' && payload.accountType !== 'ADMIN')) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { accountName: payload.accountName.trim(), selector: payload.selector, accountType: payload.accountType };
  }
  if (key === 'PASSWORD_CHANGED') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => field !== 'displayName') || typeof payload.displayName !== 'string' ||
        !payload.displayName.trim() || payload.displayName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.displayName)) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { displayName: payload.displayName.trim() };
  }
  const keys = ['customerName', 'bookingReference', 'eventDate', ...(definition.extras ?? [])];
  const payload = raw as Record<string, unknown>;
  if (Object.keys(payload).some(field => !keys.includes(field))) throw new AppError(400, 'Notification payload contains unsupported fields.');
  const result: Record<string, string> = {};
  for (const field of keys) {
    const value = payload[field];
    const maximum = field === 'reason' || field === 'actionUrl' ? 1_000 : 200;
    if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    result[field] = value.trim();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.eventDate!) ||
      (result.validUntil !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(result.validUntil)) ||
      (result.amount !== undefined && !/^\d{1,10}\.\d{2}$/.test(result.amount)) ||
      (result.quoteTotal !== undefined && !/^\d{1,10}\.\d{2}$/.test(result.quoteTotal))) {
    throw new AppError(400, 'Invalid notification date or amount.');
  }
  if (result.actionUrl !== undefined) {
    try {
      const url = new URL(result.actionUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe URL');
    } catch { throw new AppError(400, 'Invalid notification action URL.'); }
  }
  return result;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function renderPasswordResetRequestedEmail(accountName: string, resetUrl: string): RenderedEmail {
  const subject = 'Reset your password | LA Chef';
  const text = [
    `Hello ${accountName},`,
    'We received a request to reset your LA Chef account password.',
    `Reset password: ${resetUrl}`,
    'This link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email.',
    brand,
  ].join('\n\n');
  const html = [
    `<p>Hello ${escapeHtml(accountName)},</p>`,
    '<p>We received a request to reset your LA Chef account password.</p>',
    `<p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>`,
    '<p>This link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email.</p>',
    `<p>${brand}</p>`,
  ].join('');
  return { subject, text, html };
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
  if (payload.reason) lines.push(`Details needed: ${payload.reason}`);
  if (payload.quoteTotal) lines.push(`Quotation total: PHP ${payload.quoteTotal}`);
  if (payload.validUntil) lines.push(`Valid until: ${payload.validUntil}`);
  if (payload.actionUrl) lines.push(`View details: ${payload.actionUrl}`);
  lines.push(brand);
  return { subject: `${definition.subject} | LA Chef`, text: lines.join('\n\n'),
    html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') };
}
