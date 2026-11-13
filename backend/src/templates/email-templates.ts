import type { EmailTemplateKey, RenderedEmail } from '../types/notification.types.js';
import { AppError } from '../utils/app-error.js';
import { emailLayout, emailParagraph, escapeEmailHtml } from './email-layout.js';

const brand = 'LA Chef Event Catering Services';
const invoiceFields = ['invoiceUrl', 'invoiceDueDate', 'eventTime', 'eventType', 'venue', 'guestCount', 'bookingStatus',
  'paymentMethod', 'totalAmount', 'amountPaid', 'requiredDeposit', 'remainingDeposit', 'remainingBalance',
  'cashDepositDueDate', 'cashPreparationDays'] as const;
const invoiceMoneyFields = ['totalAmount', 'amountPaid', 'requiredDeposit', 'remainingDeposit', 'remainingBalance'] as const;
const paymentReviewFields = ['amountPaid', 'requiredDeposit', 'remainingDeposit', 'remainingBalance', 'correctionReason'] as const;
const templates: Record<EmailTemplateKey, { subject: string; message: string; extras?: readonly string[] }> = {
  EMAIL_VERIFICATION_CODE: { subject: 'Your LA Chef verification code', message: 'Email verification requires the protected renderer.' },
  ACCOUNT_REGISTERED: { subject: 'Account registration confirmed', message: 'Your LA Chef customer account is ready. You can now reserve an event and manage your billing details.' },
  BOOKING_RECEIVED: { subject: 'Booking received', message: 'We received your booking request. It is pending review.' },
  BOOKING_APPROVED: { subject: 'Booking approved', message: 'Your booking has been approved. LA Chef will notify you when payment is requested. You can review your invoice in your account.', extras: ['cashPaymentInstructions'] },
  PAYMENT_REQUESTED: { subject: 'Payment requested for your booking', message: 'LA Chef has requested payment for your approved booking. Sign in to your account and choose bank transfer or cash. If you choose bank transfer, wait for your assigned QR before paying.' },
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
  UPCOMING_EVENT_REMINDER: { subject: 'Your event is coming up', message: 'This is a reminder that your confirmed LA Chef event is coming up soon. Please review your event details and contact us if anything has changed.' },
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
  if (key === 'PASSWORD_RESET_REQUESTED' || key === 'EMAIL_VERIFICATION_CODE') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => !['accountName', 'selector', 'accountType'].includes(field)) ||
        typeof payload.accountName !== 'string' || !payload.accountName.trim() || payload.accountName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.accountName) ||
        typeof payload.selector !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.selector) ||
        (payload.accountType !== 'CUSTOMER' && (key === 'EMAIL_VERIFICATION_CODE' || payload.accountType !== 'ADMIN'))) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { accountName: payload.accountName.trim(), selector: payload.selector, accountType: payload.accountType };
  }
  if (key === 'PASSWORD_CHANGED' || key === 'ACCOUNT_REGISTERED') {
    const payload = raw as Record<string, unknown>;
    if (Object.keys(payload).some(field => field !== 'displayName') || typeof payload.displayName !== 'string' ||
        !payload.displayName.trim() || payload.displayName.length > 200 || /[\x00-\x1f\x7f]/.test(payload.displayName)) {
      throw new AppError(400, 'Invalid notification payload value.');
    }
    return { displayName: payload.displayName.trim() };
  }
  const optionalFields: readonly string[] = key === 'INVOICE_ISSUED' ? invoiceFields : key === 'PAYMENT_PROOF_VERIFIED' ? paymentReviewFields : [];
  const keys = ['customerName', 'bookingReference', 'eventDate', ...(definition.extras ?? []), ...optionalFields];
  const payload = raw as Record<string, unknown>;
  if (Object.keys(payload).some(field => !keys.includes(field))) throw new AppError(400, 'Notification payload contains unsupported fields.');
  const result: Record<string, string> = {};
  for (const field of keys) {
    const value = payload[field];
    if ((field === 'cashPaymentInstructions' || optionalFields.includes(field)) && value === undefined) continue;
    const maximum = field === 'cashPaymentInstructions' || field === 'venue' ? 500
      : field === 'reason' || field === 'correctionReason' || field === 'actionUrl' || field === 'invoiceUrl' ? 1_000 : 200;
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
  if (key === 'INVOICE_ISSUED' && (
    !validDateOnly(result.eventDate!) ||
    invoiceMoneyFields.some(field => result[field] !== undefined && !/^\d{1,10}\.\d{2}$/.test(result[field]!)) ||
    ['invoiceDueDate', 'cashDepositDueDate'].some(field => result[field] !== undefined && !validDateOnly(result[field]!)) ||
    (result.eventTime !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.eventTime)) ||
    (result.guestCount !== undefined && !/^[1-9]\d{0,5}$/.test(result.guestCount)) ||
    (result.cashPreparationDays !== undefined && !['3', '5'].includes(result.cashPreparationDays)) ||
    (result.paymentMethod !== undefined && !['CASH', 'E_WALLET', 'BANK_TRANSFER'].includes(result.paymentMethod)) ||
    (result.bookingStatus !== undefined && !['PENDING', 'APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED',
      'PAYMENT_VERIFIED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(result.bookingStatus))
  )) throw new AppError(400, 'Invalid invoice notification details.');
  if (key === 'PAYMENT_PROOF_VERIFIED' && invoiceMoneyFields.some(field => result[field] !== undefined && !/^\d{1,10}\.\d{2}$/.test(result[field]!))) throw new AppError(400, 'Invalid payment review amounts.');
  for (const field of ['actionUrl', 'invoiceUrl']) {
    if (result[field] === undefined) continue;
    try {
      const url = new URL(result[field]!);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe URL');
      if (field === 'invoiceUrl' && (!/^\/invoice\/[1-9]\d*$/.test(url.pathname) || url.search || url.hash)) throw new Error('invalid invoice URL');
    } catch { throw new AppError(400, 'Invalid notification action URL.'); }
  }
  return result;
}

const escapeHtml = escapeEmailHtml;

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const invoiceDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));
const invoiceMoney = (value: string) => `PHP ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const invoiceTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
}).format(new Date(`2000-01-01T${value}:00Z`));

function invoiceSection(heading: string, rows: readonly (readonly [string, string])[]): string {
  return `<h2 style="margin:26px 0 12px;font-size:16px;line-height:1.4;color:#252525">${escapeHtml(heading)}</h2>` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e8e1d5">' +
    rows.map(([label, value]) => `<tr><td style="padding:9px 12px 9px 0;border-bottom:1px solid #eee9df;vertical-align:top;width:45%;color:#6c685f">${escapeHtml(label)}</td><td style="padding:9px 0;border-bottom:1px solid #eee9df;vertical-align:top;color:#252525;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join('') + '</table>';
}

function renderInvoiceEmail(payload: Record<string, string>): RenderedEmail {
  const approved = payload.bookingStatus === 'APPROVED';
  const intro = approved ? 'Your reservation has been approved and your invoice is ready to review. LA Chef will notify you when payment is requested.' : 'Your invoice is ready to review.';
  const eventRows: [string, string][] = [['Booking reference', payload.bookingReference!]];
  if (payload.eventType) eventRows.push(['Event', payload.eventType]);
  eventRows.push(['Event date', invoiceDate(payload.eventDate!)]);
  if (payload.eventTime) eventRows.push(['Event time', invoiceTime(payload.eventTime)]);
  if (payload.venue) eventRows.push(['Venue', payload.venue]);
  if (payload.guestCount) eventRows.push(['Guests', payload.guestCount]);
  const billingRows: [string, string][] = [
    ['Invoice number', payload.invoiceNumber!], ['Invoice total', invoiceMoney(payload.totalAmount!)],
    ['Recorded payments', invoiceMoney(payload.amountPaid!)], ['Required deposit (50%)', invoiceMoney(payload.requiredDeposit!)],
    ['Remaining deposit to pay', invoiceMoney(payload.remainingDeposit!)], ['Outstanding balance', invoiceMoney(payload.remainingBalance!)],
  ];
  if (payload.invoiceDueDate) billingRows.push(['Balance due', invoiceDate(payload.invoiceDueDate)]);
  const paymentLabel = payload.paymentMethod === 'CASH' ? 'Cash' : payload.paymentMethod === 'E_WALLET' ? 'GCash'
    : payload.paymentMethod === 'BANK_TRANSFER' ? 'Bank transfer' : undefined;
  if (paymentLabel) billingRows.push(['Payment method', paymentLabel]);
  const text = [`Hello ${payload.customerName},`, intro, 'Event details', ...eventRows.map(([key, value]) => `${key}: ${value}`),
    'Invoice summary', ...billingRows.map(([key, value]) => `${key}: ${value}`)];
  let html = emailParagraph(`Hello ${payload.customerName},`) + emailParagraph(intro) +
    invoiceSection('Event details', eventRows) + invoiceSection('Invoice summary', billingRows);
  if (Number(payload.remainingBalance) === 0) {
    const paid = 'Your invoice is fully paid. No further payment is required.';
    text.push(paid); html += emailParagraph(paid);
  } else if (payload.paymentMethod === 'CASH') {
    text.push('Cash payment');
    html += '<h2 style="margin:26px 0 12px;font-size:16px;line-height:1.4;color:#252525">Cash payment</h2>';
    if (Number(payload.remainingDeposit) > 0 && payload.cashDepositDueDate) {
      const due = `50% deposit due: ${invoiceDate(payload.cashDepositDueDate)}, 6:00 PM`;
      const cutoff = payload.cashPreparationDays ? `${payload.cashPreparationDays} calendar days before your event. Approval does not change this deadline.` : 'Approval does not change this deadline.';
      text.push(due, cutoff);
      html += `<div style="margin:0 0 18px;padding:16px;background-color:#f8f6f1;border-left:3px solid #956a24"><strong>${escapeHtml(due)}</strong><br>${escapeHtml(cutoff)}</div>`;
    }
    const office = ['LA Chef office: Panorama Ville, Dita, Santa Rosa, Laguna', 'Office hours: Daily, 8:00 AM-6:00 PM'];
    const steps = [`Present your booking reference ${payload.bookingReference} to the office staff.`,
      Number(payload.remainingDeposit) > 0
        ? `Pay the remaining required deposit of ${invoiceMoney(payload.remainingDeposit!)} toward the 50% deposit, or settle the full outstanding balance of ${invoiceMoney(payload.remainingBalance!)}.`
        : `Your deposit requirement is complete. Pay your remaining balance of ${invoiceMoney(payload.remainingBalance!)}${payload.invoiceDueDate ? ' by the balance due date shown above.' : '. Review the balance due date in your invoice.'}`,
      'Collect your receipt. An administrator will record the cash actually received and update your payment status.'];
    const proof = 'No online payment proof is required for cash payments.';
    text.push(...office, ...steps.map((step, index) => `${index + 1}. ${step}`), proof);
    html += office.map(emailParagraph).join('') + '<ol style="margin:0 0 16px;padding-left:22px">' +
      steps.map(step => `<li style="padding:0 0 8px">${escapeHtml(step)}</li>`).join('') + '</ol>' + emailParagraph(proof);
  } else if (payload.paymentMethod === 'E_WALLET') {
    const instructions = 'GCash is no longer accepted. Contact LA Chef to arrange cash or bank transfer. Your recorded payments remain on your invoice.';
    text.push(instructions); html += emailParagraph(instructions);
  } else {
    const instructions = approved
      ? 'Review your invoice now. Wait for LA Chef to request payment before choosing a payment method or sending a deposit.'
      : 'Review your invoice and follow the payment instructions in your account. Contact LA Chef if you need payment details.';
    text.push(instructions); html += emailParagraph(instructions);
  }
  if (['APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED'].includes(payload.bookingStatus ?? '')) {
    const confirmation = 'Your reservation remains subject to final LA Chef confirmation.';
    text.push(confirmation); html += emailParagraph(confirmation);
  }
  const signIn = 'Sign in to your LA Chef account to view your invoice.';
  text.push(`View invoice: ${payload.invoiceUrl}`, signIn, brand);
  html += `<p style="margin:24px 0 12px"><a href="${escapeHtml(payload.invoiceUrl!)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background-color:#3f4734;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:20px;text-decoration:none">View invoice</a></p>` + emailParagraph(signIn);
  return { subject: `${approved ? 'Reservation approved - ' : ''}Invoice ${payload.invoiceNumber} | LA Chef`,
    text: text.join('\n\n'), html: emailLayout('Your invoice is ready', html) };
}

export function renderEmailVerificationCode(accountName: string, code: string): RenderedEmail {
  if (!/^\d{6}$/.test(code)) throw new AppError(400, 'Invalid verification code.');
  const heading = 'Verify your email address';
  const instructions = 'Enter this six-digit code on the La Chef website to finish creating your account.';
  const safety = 'This code is valid for 10 minutes after it was requested and can be used once. Do not share it with anyone.';
  const unsolicited = 'If you did not create a La Chef account, you can ignore this email.';
  return { subject: 'Your LA Chef verification code',
    text: [`Hello ${accountName},`, instructions, `Verification code: ${code}`, safety, unsolicited, brand].join('\n\n'),
    html: emailLayout(heading, emailParagraph(`Hello ${accountName},`) + emailParagraph(instructions) +
      `<p style="margin:24px 0;padding:18px 12px;background-color:#f8f6f1;border:1px solid #e2dbce;border-radius:6px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:600;letter-spacing:6px;line-height:1.3;color:#252525">${code}</p>` +
      emailParagraph(safety) + emailParagraph(unsolicited)) };
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
    `<p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background-color:#3f4734;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:20px;text-decoration:none">Reset password</a></p>`,
    '<p>This link expires in 15 minutes and can be used once. If you did not request it, you can ignore this email.</p>',
  ].join('');
  return { subject, text, html: emailLayout('Reset your password', html) };
}

export function renderEmail(key: EmailTemplateKey, raw: unknown): RenderedEmail {
  const payload = validateEmailPayload(key, raw);
  if (key === 'PASSWORD_RESET_REQUESTED' || key === 'EMAIL_VERIFICATION_CODE') {
    throw new AppError(404, 'Account security email preview is unavailable.');
  }
  const definition = templates[key];
  if (key === 'INVOICE_ISSUED' && payload.invoiceUrl && invoiceMoneyFields.every(field => payload[field] !== undefined)) {
    return renderInvoiceEmail(payload);
  }
  if (key === 'PASSWORD_CHANGED' || key === 'ACCOUNT_REGISTERED') {
    const lines = [`Hello ${payload.displayName},`, definition.message, brand];
    return { subject: `${definition.subject} | LA Chef`, text: lines.join('\n\n'),
      html: emailLayout(key === 'ACCOUNT_REGISTERED' ? 'Welcome to La Chef' : definition.subject, lines.slice(0, -1).map(emailParagraph).join('')) };
  }
  const lines = [`Hello ${payload.customerName},`, definition.message, `Booking: ${payload.bookingReference}`,
    `Event date: ${payload.eventDate}`];
  if (key === 'INVOICE_ISSUED') lines.push(`Invoice: ${payload.invoiceNumber}`);
  if (key === 'PAYMENT_PROOF_VERIFIED') lines.push(`Verified amount: PHP ${payload.amount}`);
  if (key === 'PAYMENT_PROOF_VERIFIED' && payload.remainingDeposit !== undefined) {
    lines.push(`Total recorded payments: PHP ${payload.amountPaid}`, `Required down payment (50%): PHP ${payload.requiredDeposit}`,
      `Remaining down payment: PHP ${payload.remainingDeposit}`, `Total balance due: PHP ${payload.remainingBalance}`);
    if (Number(payload.remainingDeposit) > 0) lines.push('Down payment incomplete. The remaining down payment is included in the total balance due. Pay only the shortfall toward your required deposit; your reservation still requires admin confirmation.');
  }
  if (key === 'PAYMENT_PROOF_VERIFIED' && payload.correctionReason) lines.push(`Admin note: ${payload.correctionReason}`);
  if (key === 'PAYMENT_RECORDED') lines.push(`Recorded amount: PHP ${payload.amount}`);
  if (payload.reason) lines.push(`Details needed: ${payload.reason}`);
  if (payload.quoteTotal) lines.push(`Quotation total: PHP ${payload.quoteTotal}`);
  if (payload.validUntil) lines.push(`Valid until: ${payload.validUntil}`);
  if (payload.actionUrl) lines.push(`View details: ${payload.actionUrl}`);
  if (payload.cashPaymentInstructions) lines.push(payload.cashPaymentInstructions.replace(/\s+(?:Philippine Time|PHT)\b/gi, ''));
  lines.push(brand);
  return { subject: `${definition.subject} | LA Chef`, text: lines.join('\n\n'),
    html: emailLayout(definition.subject, lines.slice(0, -1).map(emailParagraph).join('')) };
}
