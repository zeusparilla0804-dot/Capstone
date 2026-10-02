import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { PaymentProofRecord, PaymentProofSubmission } from '../types/payment-proof.types.js';
import type { StoredProof } from '../services/proof-storage.service.js';

const columns = `payment_proof_id id,reservation_id reservationId,customer_id customerId,
  payment_id paymentId,payment_transaction_id paymentTransactionId,invoice_id invoiceId,
  method,claimed_amount claimedAmount,transaction_reference transactionReference,
  payment_date paymentDate,storage_key storageKey,original_filename originalFilename,
  mime_type mimeType,byte_size byteSize,status,rejection_reason rejectionReason,
  reviewed_by reviewedBy,reviewed_at reviewedAt,verified_amount verifiedAmount,
  created_at createdAt,updated_at updatedAt`;

function record(row: PaymentProofRecord): PaymentProofRecord {
  return {
    ...row,
    id: Number(row.id), reservationId: Number(row.reservationId), customerId: Number(row.customerId),
    paymentId: row.paymentId == null ? undefined : Number(row.paymentId),
    paymentTransactionId: row.paymentTransactionId == null ? undefined : Number(row.paymentTransactionId),
    invoiceId: row.invoiceId == null ? undefined : Number(row.invoiceId),
    claimedAmount: Number(row.claimedAmount), byteSize: Number(row.byteSize),
    transactionReference: row.transactionReference ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    reviewedBy: row.reviewedBy == null ? undefined : Number(row.reviewedBy),
    reviewedAt: row.reviewedAt == null ? undefined : new Date(row.reviewedAt).toISOString(),
    verifiedAmount: row.verifiedAmount == null ? undefined : Number(row.verifiedAmount),
    paymentDate: new Date(row.paymentDate).toISOString().slice(0, 10),
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export async function lockedPayment(reservationId: number, request: sql.Request): Promise<{ paymentId: number; amountDue: number; amountPaid: number } | undefined> {
  const result = await request.replaceInput('reservationId', sql.Int, reservationId)
    .query<{ paymentId: number; amountDue: number; amountPaid: number }>(`SELECT payment_id paymentId,amount_due amountDue,amount_paid amountPaid
      FROM dbo.PAYMENT WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
  return result.recordset[0];
}

export async function supersedeSubmittedProofs(reservationId: number, customerId: number, request: sql.Request): Promise<void> {
  await request.replaceInput('reservationId', sql.Int, reservationId).replaceInput('customerId', sql.Int, customerId)
    .query(`UPDATE dbo.PAYMENT_PROOF SET status='SUPERSEDED',updated_at=sysutcdatetime()
      WHERE reservation_id=@reservationId AND customer_id=@customerId AND status='SUBMITTED'`);
}

export async function insertPaymentProof(customerId: number, reservationId: number, paymentId: number,
  input: PaymentProofSubmission, stored: StoredProof, request: sql.Request): Promise<PaymentProofRecord> {
  const result = await request
    .replaceInput('reservationId', sql.Int, reservationId)
    .replaceInput('customerId', sql.Int, customerId)
    .replaceInput('paymentId', sql.Int, paymentId)
    .replaceInput('method', sql.NVarChar(30), input.method)
    .replaceInput('claimedAmount', sql.Decimal(12, 2), input.claimedAmount)
    .replaceInput('transactionReference', sql.NVarChar(150), input.transactionReference ?? null)
    .replaceInput('paymentDate', sql.DateTime2, new Date(`${input.paymentDate}T00:00:00.000Z`))
    .replaceInput('storageKey', sql.NVarChar(500), stored.storageKey)
    .replaceInput('originalFilename', sql.NVarChar(255), stored.originalFilename.slice(0, 255))
    .replaceInput('mimeType', sql.NVarChar(100), stored.mimeType)
    .replaceInput('byteSize', sql.BigInt, stored.byteSize)
    .query<PaymentProofRecord>(`INSERT dbo.PAYMENT_PROOF(reservation_id,customer_id,payment_id,method,claimed_amount,
      transaction_reference,payment_date,storage_key,original_filename,mime_type,byte_size,status)
      OUTPUT INSERTED.payment_proof_id id,INSERTED.reservation_id reservationId,INSERTED.customer_id customerId,
      INSERTED.payment_id paymentId,INSERTED.payment_transaction_id paymentTransactionId,INSERTED.invoice_id invoiceId,
      INSERTED.method,INSERTED.claimed_amount claimedAmount,INSERTED.transaction_reference transactionReference,
      INSERTED.payment_date paymentDate,INSERTED.storage_key storageKey,INSERTED.original_filename originalFilename,
      INSERTED.mime_type mimeType,INSERTED.byte_size byteSize,INSERTED.status,INSERTED.rejection_reason rejectionReason,
      INSERTED.reviewed_by reviewedBy,INSERTED.reviewed_at reviewedAt,INSERTED.verified_amount verifiedAmount,
      INSERTED.created_at createdAt,INSERTED.updated_at updatedAt
      VALUES(@reservationId,@customerId,@paymentId,@method,@claimedAmount,@transactionReference,@paymentDate,
      @storageKey,@originalFilename,@mimeType,@byteSize,'SUBMITTED')`);
  return record(result.recordset[0]!);
}

export async function listProofs(customerId: number, reservationId: number, request?: sql.Request): Promise<PaymentProofRecord[]> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.replaceInput('customerId', sql.Int, customerId).replaceInput('reservationId', sql.Int, reservationId)
    .query<PaymentProofRecord>(`SELECT ${columns} FROM dbo.PAYMENT_PROOF
      WHERE reservation_id=@reservationId AND customer_id=@customerId ORDER BY created_at DESC,payment_proof_id DESC`);
  return result.recordset.map(record);
}

export async function findProof(proofId: number, request?: sql.Request): Promise<PaymentProofRecord | undefined> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.replaceInput('proofId', sql.BigInt, proofId)
    .query<PaymentProofRecord>(`SELECT ${columns} FROM dbo.PAYMENT_PROOF WHERE payment_proof_id=@proofId`);
  return result.recordset[0] ? record(result.recordset[0]) : undefined;
}

export async function customerOwnsReservation(customerId: number, reservationId: number, request?: sql.Request): Promise<boolean> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.replaceInput('customerId', sql.Int, customerId).replaceInput('reservationId', sql.Int, reservationId)
    .query('SELECT reservation_id id FROM dbo.RESERVATION WHERE reservation_id=@reservationId AND customer_id=@customerId');
  return result.recordset.length > 0;
}
