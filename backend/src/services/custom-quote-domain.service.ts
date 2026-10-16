import type { CustomEventRequestStatus, CustomQuoteStatus } from '../types/custom-event.types.js';
import { AppError } from '../utils/app-error.js';

const MAX_DECIMAL_12_2 = 9_999_999_999.99;
const MAX_QUOTE_ITEMS = 100;

export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface QuoteTotals {
  lineTotals: number[];
  subtotal: number;
  total: number;
  requiredDownPayment: number;
}

function hasCentPrecision(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

function validDecimal(value: number, allowZero: boolean): boolean {
  return Number.isFinite(value)
    && value <= MAX_DECIMAL_12_2
    && (allowZero ? value >= 0 : value > 0)
    && hasCentPrecision(value);
}

function fromCents(value: number): number {
  return value / 100;
}

function itemInvalid(): never {
  throw new AppError(400, 'Each quotation line requires a valid description, quantity, and unit price.', 'CUSTOM_QUOTE_ITEM_INVALID');
}

export function calculateQuoteTotals(items: readonly QuoteLineInput[], requiredDownPayment: number): QuoteTotals {
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_QUOTE_ITEMS) itemInvalid();

  const lineTotalCents = items.map((item) => {
    if (
      typeof item.description !== 'string'
      || item.description.trim().length < 1
      || item.description.trim().length > 250
      || !validDecimal(item.quantity, false)
      || item.quantity > 10_000
      || !validDecimal(item.unitPrice, true)
    ) itemInvalid();

    const rawTotal = item.quantity * item.unitPrice;
    if (!Number.isFinite(rawTotal) || rawTotal > MAX_DECIMAL_12_2) itemInvalid();
    const totalCents = Math.round((rawTotal + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(totalCents)) itemInvalid();
    return totalCents;
  });

  const subtotalCents = lineTotalCents.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > MAX_DECIMAL_12_2 * 100) itemInvalid();
  if (!validDecimal(requiredDownPayment, true)) {
    throw new AppError(400, 'Required down payment must be a valid amount within the quotation total.', 'CUSTOM_QUOTE_DOWN_PAYMENT_INVALID');
  }
  const downPaymentCents = Math.round(requiredDownPayment * 100);
  if (downPaymentCents > subtotalCents) {
    throw new AppError(400, 'Required down payment must be a valid amount within the quotation total.', 'CUSTOM_QUOTE_DOWN_PAYMENT_INVALID');
  }

  const subtotal = fromCents(subtotalCents);
  return {
    lineTotals: lineTotalCents.map(fromCents),
    subtotal,
    total: subtotal,
    requiredDownPayment: fromCents(downPaymentCents),
  };
}

export function assertQuoteAcceptable(
  quote: Pick<{ status: CustomQuoteStatus; validUntil: string }, 'status' | 'validUntil'>,
  now = new Date(),
): void {
  const today = now.toISOString().slice(0, 10);
  if (quote.status !== 'SENT' || !/^\d{4}-\d{2}-\d{2}$/.test(quote.validUntil) || quote.validUntil < today) {
    throw new AppError(409, 'This quotation is no longer available for acceptance.', 'CUSTOM_QUOTE_NOT_ACCEPTABLE');
  }
}

const REQUEST_TRANSITIONS: Readonly<Record<CustomEventRequestStatus, readonly CustomEventRequestStatus[]>> = {
  AWAITING_QUOTE: ['NEEDS_CLARIFICATION', 'QUOTE_SENT', 'REJECTED'],
  NEEDS_CLARIFICATION: ['AWAITING_QUOTE', 'QUOTE_SENT', 'REJECTED'],
  QUOTE_SENT: ['QUOTE_SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
  ACCEPTED: [],
  DECLINED: [],
  REJECTED: [],
  EXPIRED: [],
};

const QUOTE_TRANSITIONS: Readonly<Record<CustomQuoteStatus, readonly CustomQuoteStatus[]>> = {
  DRAFT: ['SENT'],
  SENT: ['SUPERSEDED', 'ACCEPTED', 'DECLINED', 'EXPIRED'],
  SUPERSEDED: [],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
};

export function assertRequestTransition(from: CustomEventRequestStatus, to: CustomEventRequestStatus): void {
  if (!REQUEST_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(409, `Custom request cannot change from ${from} to ${to}.`, 'CUSTOM_REQUEST_STATE_CONFLICT');
  }
}

export function assertQuoteTransition(from: CustomQuoteStatus, to: CustomQuoteStatus): void {
  if (!QUOTE_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(409, `Quotation cannot change from ${from} to ${to}.`, 'CUSTOM_QUOTE_STATE_CONFLICT');
  }
}
