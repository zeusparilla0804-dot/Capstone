import sql from 'mssql';
import type { PaymentBankSnapshot } from '../types/payment-bank.types.js';

export function bankSnapshotColumns(alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}destination_id destinationId,${prefix}destination_label destinationLabel,
    ${prefix}destination_account_name destinationAccountName,${prefix}destination_account_hint destinationAccountHint,
    ${prefix}destination_version destinationVersion`;
}

export function bindBankSnapshot(request: sql.Request, bank?: Partial<PaymentBankSnapshot>): sql.Request {
  return request.replaceInput('destinationId', sql.Int, bank?.destinationId ?? null)
    .replaceInput('destinationLabel', sql.NVarChar(100), bank?.destinationLabel ?? null)
    .replaceInput('destinationAccountName', sql.NVarChar(200), bank?.destinationAccountName ?? null)
    .replaceInput('destinationAccountHint', sql.NVarChar(50), bank?.destinationAccountHint ?? null)
    .replaceInput('destinationVersion', sql.NVarChar(64), bank?.destinationVersion ?? null);
}

export function mapBankSnapshot(row: Record<string, unknown>): Partial<PaymentBankSnapshot> {
  return { destinationId: row['destinationId'] == null ? undefined : Number(row['destinationId']),
    destinationLabel: row['destinationLabel'] == null ? undefined : String(row['destinationLabel']),
    destinationAccountName: row['destinationAccountName'] == null ? undefined : String(row['destinationAccountName']),
    destinationAccountHint: row['destinationAccountHint'] == null ? undefined : String(row['destinationAccountHint']),
    destinationVersion: row['destinationVersion'] == null ? undefined : String(row['destinationVersion']) };
}

export interface BankDestinationRow {
  id: number; method: string; label: string; accountName: string; accountHint: string;
  isAvailable: boolean; mime: string; image: Buffer;
}

const bankColumns = `d.destination_id id,d.method,d.label,d.account_name accountName,
  d.account_hint accountHint,d.is_available isAvailable,d.image_mime mime,d.image_bytes image`;

export async function readBankPaymentContext(customerId: number, reservationId: number, request: sql.Request) {
  const result = await request.replaceInput('bankCustomerId', sql.Int, customerId)
    .replaceInput('bankBookingId', sql.Int, reservationId)
    .query<{ customerId: number; status: string; method: string; amountDue: number; amountPaid: number }>(`
      SELECT r.customer_id customerId,r.status,p.payment_method method,p.amount_due amountDue,p.amount_paid amountPaid
      FROM dbo.RESERVATION r JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
      WHERE r.reservation_id=@bankBookingId AND r.customer_id=@bankCustomerId`);
  return result.recordset[0];
}

export async function readAvailableBanks(request: sql.Request): Promise<BankDestinationRow[]> {
  const result = await request.query<BankDestinationRow>(`SELECT ${bankColumns} FROM dbo.PAYMENT_DESTINATION d
    WHERE d.method='BANK_TRANSFER' AND d.is_available=1 AND DATALENGTH(d.image_bytes)>0 ORDER BY d.label,d.destination_id`);
  return result.recordset;
}

export async function readBankDestination(id: number, request: sql.Request, lock = false): Promise<BankDestinationRow | undefined> {
  const result = await request.replaceInput('bankDestinationId', sql.Int, id)
    .query<BankDestinationRow>(`SELECT ${bankColumns} FROM dbo.PAYMENT_DESTINATION d ${lock ? 'WITH(UPDLOCK,HOLDLOCK)' : ''}
      WHERE d.destination_id=@bankDestinationId`);
  return result.recordset[0];
}

export async function readLegacyBankDestination(reservationId: number, request: sql.Request): Promise<BankDestinationRow | undefined> {
  const result = await request.replaceInput('destinationReservationId', sql.Int, reservationId)
    .query<BankDestinationRow>(`SELECT TOP(1) ${bankColumns} FROM dbo.BOOKING_PAYMENT_DESTINATION a
      JOIN dbo.PAYMENT_DESTINATION d WITH(UPDLOCK,HOLDLOCK) ON d.destination_id=a.destination_id
      WHERE a.reservation_id=@destinationReservationId AND d.method='BANK_TRANSFER' AND d.is_available=1`);
  return result.recordset[0];
}
