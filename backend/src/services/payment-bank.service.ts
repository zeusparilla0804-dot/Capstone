import { createHash } from 'node:crypto';
import type sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { readAvailableBanks, readBankDestination, readBankPaymentContext, readLegacyBankDestination,
  type BankDestinationRow } from '../repositories/payment-bank.repository.js';
import type { PaymentBankOption, PaymentBankSnapshot } from '../types/payment-bank.types.js';
import { AppError } from '../utils/app-error.js';

const payableStatuses = new Set(['AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED']);

export function paymentBankVersion(bank: BankDestinationRow): string {
  return createHash('sha256').update(JSON.stringify([bank.id, bank.method, bank.label, bank.accountName, bank.accountHint, bank.mime]))
    .update(bank.image).digest('hex');
}

function available(bank: BankDestinationRow | undefined): bank is BankDestinationRow {
  return !!bank && bank.method === 'BANK_TRANSFER' && !!bank.isAvailable && Buffer.isBuffer(bank.image) && bank.image.length > 0;
}

function requireAvailable(bank: BankDestinationRow | undefined): asserts bank is BankDestinationRow {
  if (!available(bank)) throw new AppError(409, 'This bank account is unavailable. Refresh the available accounts. If you already transferred money, contact LA Chef; do not pay again.', 'PAYMENT_BANK_UNAVAILABLE');
}

function option(bank: BankDestinationRow): PaymentBankOption {
  return { id: Number(bank.id), method: 'BANK_TRANSFER', label: bank.label, accountName: bank.accountName,
    accountHint: bank.accountHint, version: paymentBankVersion(bank) };
}

function assertVersion(bank: BankDestinationRow, version: string): void {
  if (paymentBankVersion(bank) !== version) throw new AppError(409, 'The selected bank account or QR has changed. Refresh the accounts. If you already transferred money, contact LA Chef; do not pay again.', 'PAYMENT_BANK_CHANGED');
}

function bankId(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new AppError(400, 'Bank account identifier is invalid.');
}

async function requireCustomerContext(customerId: number, reservationId: number, request: sql.Request): Promise<void> {
  bankId(customerId); bankId(reservationId);
  const booking = await readBankPaymentContext(customerId, reservationId, request);
  if (!booking || Number(booking.customerId) !== customerId) throw new AppError(404, 'Booking not found.');
  if (!payableStatuses.has(booking.status) || booking.method !== 'BANK_TRANSFER'
    || Math.round(Number(booking.amountPaid) * 100) >= Math.round(Number(booking.amountDue) * 100)) {
    throw new AppError(409, 'Booking is not awaiting a bank payment.');
  }
}

export async function listCustomerBankOptions(customerId: number, reservationId: number): Promise<PaymentBankOption[]> {
  const request = (await getDbPool()).request();
  await requireCustomerContext(customerId, reservationId, request);
  return (await readAvailableBanks(request)).filter(available).map(option);
}

export async function listAdminBankOptions(): Promise<PaymentBankOption[]> {
  return (await readAvailableBanks((await getDbPool()).request())).filter(available).map(option);
}

export function staffBankChoice(method: string, amount: number, destinationId?: number, destinationVersion?: string) {
  if (method !== 'BANK_TRANSFER' || amount === 0) {
    if (destinationId !== undefined || destinationVersion !== undefined) throw new AppError(400, 'A receiving bank is only used for bank transfer payments.');
    return {};
  }
  if (destinationId === undefined || destinationVersion === undefined) throw new AppError(400, 'Select the receiving bank account before recording a bank payment.');
  bankId(destinationId);
  if (!/^[a-f0-9]{64}$/.test(destinationVersion)) throw new AppError(400, 'Bank account version is invalid. Refresh the bank accounts.');
  return { destinationId, destinationVersion };
}

export async function openCustomerBankQr(customerId: number, reservationId: number, destinationId: number, version: string) {
  bankId(destinationId);
  const request = (await getDbPool()).request();
  await requireCustomerContext(customerId, reservationId, request);
  const bank = await readBankDestination(destinationId, request);
  requireAvailable(bank); assertVersion(bank, version);
  return { bytes: bank.image, mime: bank.mime };
}

/** The caller already owns the reservation and payment locks. No assignment is created. */
export async function resolvePaymentBankSnapshot(reservationId: number, destinationId: number | undefined,
  version: string | undefined, request: sql.Request): Promise<PaymentBankSnapshot> {
  if ((destinationId === undefined) !== (version === undefined)) throw new AppError(400, 'Select a bank account and its current QR before submitting payment.');
  if (destinationId !== undefined) bankId(destinationId);
  if (version !== undefined && !/^[a-f0-9]{64}$/.test(version)) throw new AppError(400, 'Bank account version is invalid.');
  const bank = destinationId === undefined ? await readLegacyBankDestination(reservationId, request)
    : await readBankDestination(destinationId, request, true);
  requireAvailable(bank);
  if (version !== undefined) assertVersion(bank, version);
  const selected = option(bank);
  return { destinationId: selected.id, destinationLabel: selected.label, destinationAccountName: selected.accountName,
    destinationAccountHint: selected.accountHint, destinationVersion: selected.version };
}
