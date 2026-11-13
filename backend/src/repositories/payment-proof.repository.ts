import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { PaymentProofRecord, PaymentProofSubmission } from '../types/payment-proof.types.js';
import type { StoredProof } from '../services/proof-storage.service.js';
import type { BookingStatus, PageResult, ProofReviewQuery } from '../types/admin.types.js';
import type { PaymentBankSnapshot } from '../types/payment-bank.types.js';
import { bankSnapshotColumns, bindBankSnapshot } from './payment-bank.repository.js';

const columns = `${bankSnapshotColumns()},payment_proof_id id,reservation_id reservationId,customer_id customerId,
  payment_id paymentId,CONVERT(varchar(20),payment_transaction_id) paymentTransactionId,invoice_id invoiceId,
  method,claimed_amount claimedAmount,COALESCE(transaction_reference,archived_transaction_reference) transactionReference,
  payment_date paymentDate,storage_key storageKey,original_filename originalFilename,
  mime_type mimeType,byte_size byteSize,status,rejection_reason rejectionReason,
  reviewed_by reviewedBy,reviewed_at reviewedAt,verified_amount verifiedAmount,
  CASE WHEN status='VERIFIED' THEN (SELECT TOP(1) JSON_VALUE(a.new_values,'$.reason') FROM dbo.ADMIN_AUDIT_LOG a
    WHERE a.entity_type='BOOKING' AND a.entity_id=reservation_id AND a.action='PAYMENT_PROOF_VERIFIED'
      AND JSON_VALUE(a.new_values,'$.proofId')=CONVERT(varchar(20),payment_proof_id)
    ORDER BY a.audit_id DESC) END correctionReason,
  created_at createdAt,updated_at updatedAt`;

function record(row: PaymentProofRecord): PaymentProofRecord {
  return {
    ...row,
    destinationId: row.destinationId == null ? undefined : Number(row.destinationId),
    destinationLabel: row.destinationLabel ?? undefined, destinationAccountName: row.destinationAccountName ?? undefined,
    destinationAccountHint: row.destinationAccountHint ?? undefined, destinationVersion: row.destinationVersion ?? undefined,
    id: Number(row.id), reservationId: Number(row.reservationId), customerId: Number(row.customerId),
    paymentId: row.paymentId == null ? undefined : Number(row.paymentId),
    paymentTransactionId: row.paymentTransactionId ?? undefined,
    invoiceId: row.invoiceId == null ? undefined : Number(row.invoiceId),
    claimedAmount: Number(row.claimedAmount), byteSize: Number(row.byteSize),
    transactionReference: row.transactionReference ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    correctionReason: row.correctionReason ?? undefined,
    reviewedBy: row.reviewedBy == null ? undefined : Number(row.reviewedBy),
    reviewedAt: row.reviewedAt == null ? undefined : new Date(row.reviewedAt).toISOString(),
    verifiedAmount: row.verifiedAmount == null ? undefined : Number(row.verifiedAmount),
    paymentDate: new Date(row.paymentDate).toISOString().slice(0, 10),
    createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString()
  };
}

export async function lockedPayment(reservationId: number, request: sql.Request): Promise<{ paymentId: number; amountDue: number; amountPaid: number; paymentMethod?: string } | undefined> {
  const result = await request.replaceInput('reservationId', sql.Int, reservationId)
    .query<{ paymentId: number; amountDue: number; amountPaid: number; paymentMethod?: string }>(`SELECT payment_id paymentId,amount_due amountDue,amount_paid amountPaid,payment_method paymentMethod
      FROM dbo.PAYMENT WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
  return result.recordset[0];
}

/** Caller owns reservation and payment locks, then locks the proof being replaced. */
export async function lockedSubmittedProof(customerId: number, reservationId: number, request: sql.Request): Promise<PaymentProofRecord | undefined> {
  const result = await request.replaceInput('customerId', sql.Int, customerId).replaceInput('reservationId', sql.Int, reservationId)
    .query<PaymentProofRecord>(`SELECT TOP(1) ${columns} FROM dbo.PAYMENT_PROOF WITH(UPDLOCK,HOLDLOCK)
      WHERE customer_id=@customerId AND reservation_id=@reservationId AND status='SUBMITTED'
      ORDER BY created_at DESC,payment_proof_id DESC`);
  return result.recordset[0] ? record(result.recordset[0]) : undefined;
}

export async function supersedeSubmittedProofs(reservationId: number, customerId: number, request: sql.Request): Promise<void> {
  await request.replaceInput('reservationId', sql.Int, reservationId).replaceInput('customerId', sql.Int, customerId)
    .query(`UPDATE dbo.PAYMENT_PROOF SET status='SUPERSEDED',archived_transaction_reference=transaction_reference,
      transaction_reference=NULL,updated_at=sysutcdatetime()
      WHERE reservation_id=@reservationId AND customer_id=@customerId AND status='SUBMITTED'`);
}

export async function insertPaymentProof(customerId: number, reservationId: number, paymentId: number,
  input: PaymentProofSubmission & Partial<PaymentBankSnapshot>, stored: StoredProof, request: sql.Request): Promise<PaymentProofRecord> {
  const result = await bindBankSnapshot(request, input)
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
      transaction_reference,payment_date,storage_key,original_filename,mime_type,byte_size,status,
      destination_id,destination_label,destination_account_name,destination_account_hint,destination_version)
      OUTPUT INSERTED.payment_proof_id id,INSERTED.reservation_id reservationId,INSERTED.customer_id customerId,
      INSERTED.payment_id paymentId,CONVERT(varchar(20),INSERTED.payment_transaction_id) paymentTransactionId,INSERTED.invoice_id invoiceId,
      INSERTED.method,INSERTED.claimed_amount claimedAmount,INSERTED.transaction_reference transactionReference,
      INSERTED.payment_date paymentDate,INSERTED.storage_key storageKey,INSERTED.original_filename originalFilename,
      INSERTED.mime_type mimeType,INSERTED.byte_size byteSize,INSERTED.status,INSERTED.rejection_reason rejectionReason,
      INSERTED.reviewed_by reviewedBy,INSERTED.reviewed_at reviewedAt,INSERTED.verified_amount verifiedAmount,
      INSERTED.destination_id destinationId,INSERTED.destination_label destinationLabel,
      INSERTED.destination_account_name destinationAccountName,INSERTED.destination_account_hint destinationAccountHint,
      INSERTED.destination_version destinationVersion,INSERTED.created_at createdAt,INSERTED.updated_at updatedAt
      VALUES(@reservationId,@customerId,@paymentId,@method,@claimedAmount,@transactionReference,@paymentDate,
      @storageKey,@originalFilename,@mimeType,@byteSize,'SUBMITTED',
      @destinationId,@destinationLabel,@destinationAccountName,@destinationAccountHint,@destinationVersion)`);
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

// Call only after the reservation and its payment aggregate are locked.
export async function lockedProof(proofId: number, request: sql.Request): Promise<PaymentProofRecord | undefined> {
  const result = await request.replaceInput('proofId', sql.BigInt, proofId)
    .query<PaymentProofRecord>(`SELECT ${columns} FROM dbo.PAYMENT_PROOF WITH(UPDLOCK,HOLDLOCK) WHERE payment_proof_id=@proofId`);
  return result.recordset[0] ? record(result.recordset[0]) : undefined;
}

export async function insertProofCredit(adminId: number, paymentId: number, proof: PaymentProofRecord,
  amount: number, request: sql.Request): Promise<string> {
  const result = await bindBankSnapshot(request, proof).replaceInput('adminId', sql.Int, adminId).replaceInput('paymentId', sql.Int, paymentId)
    .replaceInput('amount', sql.Decimal(12, 2), amount)
    .replaceInput('method', sql.NVarChar(50), proof.method === 'E_WALLET' ? 'E-WALLET' : proof.method)
    .replaceInput('reference', sql.NVarChar(150), proof.transactionReference ?? null)
    .replaceInput('paymentDate', sql.DateTime2, new Date(`${proof.paymentDate}T00:00:00.000Z`))
    .query<{ id: string }>(`INSERT dbo.PAYMENT_TRANSACTION(payment_id,admin_id,amount,payment_method,transaction_ref,payment_date,
      destination_id,destination_label,destination_account_name,destination_account_hint,destination_version)
      OUTPUT CONVERT(varchar(20),INSERTED.payment_transaction_id) id VALUES(@paymentId,@adminId,@amount,@method,@reference,@paymentDate,
      @destinationId,@destinationLabel,@destinationAccountName,@destinationAccountHint,@destinationVersion)`);
  return result.recordset[0]!.id;
}

export async function creditProofPayment(request: sql.Request): Promise<boolean> {
  const result = await request.query(`UPDATE dbo.PAYMENT SET amount_paid=amount_paid+@amount,payment_method=@method,
    transaction_ref=@reference,payment_date=@paymentDate,
    status=CASE WHEN amount_paid+@amount>=amount_due THEN 'PAID' ELSE 'PARTIALLY_PAID' END
    WHERE payment_id=@paymentId AND reservation_id=@reservationId`);
  return result.rowsAffected[0] === 1;
}

export async function lockedProofInvoice(reservationId: number, request: sql.Request): Promise<{ id: number; totalAmount: number; status: string } | undefined> {
  const result = await request.replaceInput('reservationId', sql.Int, reservationId)
    .query<{ id: number; totalAmount: number; status: string }>(`SELECT invoice_id id,total_amount totalAmount,status
      FROM dbo.INVOICE WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
  return result.recordset[0];
}

export async function setProofInvoiceStatus(invoiceId: number, status: 'PAID' | 'PARTIALLY_PAID', request: sql.Request): Promise<boolean> {
  const result = await request.replaceInput('invoiceId', sql.Int, invoiceId).replaceInput('invoiceStatus', sql.NVarChar(30), status)
    .query(`UPDATE dbo.INVOICE SET status=@invoiceStatus WHERE invoice_id=@invoiceId AND status<>'CANCELLED'`);
  return result.rowsAffected[0] === 1;
}

export async function markProofReviewed(input: { proofId: number; reservationId: number; adminId: number;
  status: 'VERIFIED' | 'REJECTED'; reason?: string; amount?: number; transactionId?: string; invoiceId?: number }, request: sql.Request): Promise<boolean> {
  const result = await request.replaceInput('proofId', sql.BigInt, input.proofId)
    .replaceInput('reservationId', sql.Int, input.reservationId).replaceInput('adminId', sql.Int, input.adminId)
    .replaceInput('reviewStatus', sql.NVarChar(30), input.status)
    .replaceInput('rejectionReason', sql.NVarChar(1000), input.status === 'REJECTED' ? input.reason : null)
    .replaceInput('verifiedAmount', sql.Decimal(12, 2), input.amount ?? null)
    .replaceInput('paymentTransactionId', sql.BigInt, input.transactionId ?? null)
    .replaceInput('invoiceId', sql.Int, input.invoiceId ?? null)
    .query(`UPDATE dbo.PAYMENT_PROOF SET status=@reviewStatus,rejection_reason=@rejectionReason,
      verified_amount=@verifiedAmount,payment_transaction_id=@paymentTransactionId,invoice_id=@invoiceId,
      archived_transaction_reference=CASE WHEN @reviewStatus='REJECTED' THEN transaction_reference ELSE archived_transaction_reference END,
      transaction_reference=CASE WHEN @reviewStatus='REJECTED' THEN NULL ELSE transaction_reference END,
      reviewed_by=@adminId,reviewed_at=sysutcdatetime(),updated_at=sysutcdatetime()
      WHERE payment_proof_id=@proofId AND reservation_id=@reservationId AND status='SUBMITTED'`);
  return result.rowsAffected[0] === 1;
}

export async function listReviewProofs(query: ProofReviewQuery, request: sql.Request): Promise<PageResult<PaymentProofRecord>> {
  const filter = `FROM dbo.PAYMENT_PROOF pp
    WHERE (@status='ALL' OR pp.status=@status) AND (@reservationId IS NULL OR pp.reservation_id=@reservationId)
      AND (@method='' OR pp.method=@method)
      AND (@date='' OR pp.payment_date=CONVERT(date,NULLIF(@date,'')))
      AND (@dateFrom='' OR pp.payment_date>=CONVERT(date,NULLIF(@dateFrom,'')))
      AND (@dateTo='' OR CONVERT(date,pp.payment_date)<=CONVERT(date,NULLIF(@dateTo,'')))
      AND (@search='' OR COALESCE(pp.transaction_reference,pp.archived_transaction_reference) LIKE '%'+@search+'%' OR EXISTS(
        SELECT 1 FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
        WHERE r.reservation_id=pp.reservation_id AND (r.booking_reference LIKE '%'+@search+'%'
          OR CONCAT(c.first_name,' ',c.last_name) LIKE '%'+@search+'%' OR c.email LIKE '%'+@search+'%')))`;
  // Oldest first avoids starving pending work; ID breaks ties deterministically.
  const direction = query.order === 'newest' ? 'DESC' : 'ASC';
  const result = await request.replaceInput('status', sql.NVarChar(30), query.status)
    .replaceInput('reservationId', sql.Int, query.reservationId ?? null)
    .replaceInput('method', sql.NVarChar(30), query.method).replaceInput('search', sql.NVarChar(200), query.search)
    .replaceInput('date', sql.VarChar(10), query.date).replaceInput('dateFrom', sql.VarChar(10), query.dateFrom)
    .replaceInput('dateTo', sql.VarChar(10), query.dateTo).replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
    .replaceInput('pageSize', sql.Int, query.pageSize)
    .query(`SELECT COUNT(*) totalItems ${filter};
      SELECT ${columns} ${filter} ORDER BY pp.created_at ${direction},pp.payment_proof_id ${direction}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
  if (!Array.isArray(result.recordsets)) throw new Error('Unexpected proof queue result sets.');
  const totalItems = Number(result.recordsets[0]?.[0]?.totalItems ?? 0);
  return { items: (result.recordsets[1] ?? []).map(record), page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) };
}

export interface ProofReviewContextRow {
  reservationId: number; bookingReference: string; bookingStatus: BookingStatus; eventDate: Date | string;
  customerId: number; customerName: string; customerEmail: string;
  paymentId: number | null; amountDue: number; amountPaid: number; paymentStatus: string;
  invoiceId: number | null; invoiceNumber: string; invoiceTotal: number; invoiceStatus: string;
}

export async function proofReviewContext(reservationId: number, request: sql.Request): Promise<ProofReviewContextRow | undefined> {
  const result = await request.replaceInput('reservationId', sql.Int, reservationId)
    .query<ProofReviewContextRow>(`SELECT r.reservation_id reservationId,r.booking_reference bookingReference,r.status bookingStatus,
      r.event_date eventDate,c.customer_id customerId,CONCAT(c.first_name,' ',c.last_name) customerName,c.email customerEmail,
      p.payment_id paymentId,p.amount_due amountDue,p.amount_paid amountPaid,p.status paymentStatus,
      i.invoice_id invoiceId,i.invoice_number invoiceNumber,i.total_amount invoiceTotal,i.status invoiceStatus
      FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
      LEFT JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id
      WHERE r.reservation_id=@reservationId`);
  return result.recordset[0];
}

export async function proofReferencesStorageKey(storageKey: string, request: sql.Request): Promise<boolean> {
  // A locking read must wait for pending writes even when the database uses RCSI.
  const result = await request.replaceInput('storageKey', sql.NVarChar(500), storageKey)
    .query('SELECT TOP(1) payment_proof_id id FROM dbo.PAYMENT_PROOF WITH(READCOMMITTEDLOCK) WHERE storage_key=@storageKey');
  return result.recordset.length > 0;
}

export async function customerOwnsReservation(customerId: number, reservationId: number, request?: sql.Request): Promise<boolean> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.replaceInput('customerId', sql.Int, customerId).replaceInput('reservationId', sql.Int, reservationId)
    .query('SELECT reservation_id id FROM dbo.RESERVATION WHERE reservation_id=@reservationId AND customer_id=@customerId');
  return result.recordset.length > 0;
}
