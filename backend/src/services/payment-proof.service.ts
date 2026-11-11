import type sql from 'mssql';
import mssql from 'mssql';
import { proofStorage } from '../config/uploads.js';
import { getDbPool } from '../config/database.js';
import { lockedBookingStatus, runBookingStatusTransaction } from '../repositories/booking-status.repository.js';
import { customerOwnsReservation, findProof, insertPaymentProof, listProofs, lockedPayment, proofReferencesStorageKey, supersedeSubmittedProofs } from '../repositories/payment-proof.repository.js';
import { AppError } from '../utils/app-error.js';
import { isoDate } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { transitionBooking } from './booking-status.service.js';
import { assertProofMatchesPayment } from './booking-payment-policy.js';
import type { ProofStorage, ValidatedProofFile } from './proof-storage.service.js';
import type { PaymentProofRecord, PaymentProofSubmission } from '../types/payment-proof.types.js';
import { queueBookingNotification } from './notification.service.js';

type Actor = { type: 'CUSTOMER' | 'ADMIN'; id: number };
type Dependencies = {
  storage: ProofStorage;
  readRequest: () => sql.Request | Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
};

function positiveId(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError(400, 'Invalid identifier.');
}

function requirePossibleBooking(customerId: number, reservationId: number): void {
  // Booking and customer keys are SQL int; proof keys are bigint.
  if (customerId > 2_147_483_647 || reservationId > 2_147_483_647) throw new AppError(404, 'Booking not found.');
}

function validateInput(value: unknown): PaymentProofSubmission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Payment submission is invalid.');
  const raw = value as Record<string, unknown>;
  if (typeof raw.method !== 'string' || !['CASH', 'BANK_TRANSFER', 'E_WALLET'].includes(raw.method)) throw new AppError(400, 'Payment method is invalid.');
  if (raw.method === 'CASH') throw new AppError(400, 'Cash payments are accepted at the LA Chef office and recorded by an administrator. No online payment proof is required.');
  const amountText = typeof raw.claimedAmount === 'string' ? raw.claimedAmount.trim() : undefined;
  if (amountText !== undefined && !/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
    throw new AppError(400, 'Claimed amount must be positive with at most two decimal places.');
  }
  const amount = amountText === undefined ? raw.claimedAmount : Number(amountText);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
    (!Number.isInteger(amount) && amount !== Math.round(amount * 100) / 100)) {
    throw new AppError(400, 'Claimed amount must be positive with at most two decimal places.');
  }
  if (typeof raw.paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.paymentDate)) throw new AppError(400, 'Payment date is invalid.');
  const paymentDate = isoDate(raw.paymentDate, 'Payment date');
  if (paymentDate.startsWith('0000-')) throw new AppError(400, 'Payment date is invalid.');
  if (raw.transactionReference !== undefined && typeof raw.transactionReference !== 'string') throw new AppError(400, 'Transaction reference is invalid.');
  const reference = raw.transactionReference?.trim();
  if (reference && reference.length > 150) throw new AppError(400, 'Transaction reference is too long.');
  if (raw.method !== 'CASH' && !reference) throw new AppError(400, 'Transaction reference is required.');
  return { method: raw.method as PaymentProofSubmission['method'], claimedAmount: amount, paymentDate, transactionReference: reference || undefined };
}

function duplicateReference(error: unknown): boolean {
  const sqlError = error as { number?: number; originalError?: { info?: { number?: number } } };
  return [2601, 2627].includes(sqlError?.number ?? sqlError?.originalError?.info?.number ?? 0);
}

export function createPaymentProofService(deps: Dependencies) {
  function warn(event: string, message: string): void {
    try { logger.warn(event, message); } catch { /* Preserve the primary submission error. */ }
  }

  async function reconcileStoredProof(storageKey: string): Promise<void> {
    let referenced: boolean;
    try {
      referenced = await proofReferencesStorageKey(storageKey, await deps.readRequest());
    } catch {
      warn('payment_proof.reconciliation_failed', 'Stored proof preserved because persistence could not be confirmed.');
      return;
    }
    if (referenced) {
      warn('payment_proof.persistence_reconciled', 'Stored proof preserved because persisted metadata references it after a failed submission.');
      return;
    }
    try {
      await deps.storage.delete(storageKey);
    } catch {
      warn('payment_proof.cleanup_failed', 'Stored proof cleanup failed after confirmed database absence.');
    }
  }

  return {
    async submitCustomerProof(customerId: number, reservationId: number, raw: unknown, file: ValidatedProofFile): Promise<PaymentProofRecord> {
      positiveId(customerId); positiveId(reservationId);
      const input = validateInput(raw);
      if (!file?.bytes || !Buffer.isBuffer(file.bytes)) throw new AppError(400, 'One payment proof file is required.');
      requirePossibleBooking(customerId, reservationId);
      const stored = await deps.storage.save(file);
      try {
        return await deps.transaction(async request => {
          const booking = await lockedBookingStatus(reservationId, request);
          if (!booking || booking.customerId !== customerId) throw new AppError(404, 'Booking not found.');
          if (!['AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'].includes(booking.status)) throw new AppError(409, 'Booking is not awaiting a payment proof.');
          const payment = await lockedPayment(reservationId, request);
          if (!payment) throw new AppError(409, 'Booking has no payment record.');
          if (payment.paymentMethod?.toUpperCase() === 'CASH') throw new AppError(409, 'This booking uses cash payment. Please pay at the LA Chef office.');
          assertProofMatchesPayment(payment.paymentMethod, input.method);
          const destination = await request.input('destinationReservationId', mssql.Int, reservationId)
            .input('destinationMethod', mssql.NVarChar(30), payment.paymentMethod)
            .query(`SELECT TOP(1) d.destination_id FROM dbo.BOOKING_PAYMENT_DESTINATION a
              JOIN dbo.PAYMENT_DESTINATION d ON d.destination_id=a.destination_id
              WHERE a.reservation_id=@destinationReservationId AND d.is_available=1 AND d.method=@destinationMethod`);
          if (!destination.recordset.length) throw new AppError(409, 'An available payment QR has not been assigned to this booking.');
          const outstanding = Math.round(Number(payment.amountDue) * 100) - Math.round(Number(payment.amountPaid) * 100);
          if (outstanding <= 0) throw new AppError(409, 'Booking has no outstanding balance.');
          if (Math.round(input.claimedAmount * 100) > outstanding) throw new AppError(409, 'Claimed amount exceeds the outstanding balance.');
          await supersedeSubmittedProofs(reservationId, customerId, request);
          const proof = await insertPaymentProof(customerId, reservationId, payment.paymentId, input, stored, request);
          if (booking.status === 'AWAITING_PAYMENT') {
            await transitionBooking({ reservationId, nextStatus: 'PAYMENT_SUBMITTED', expectedStatus: 'AWAITING_PAYMENT', actor: { type: 'CUSTOMER', id: customerId }, request });
          }
          await queueBookingNotification(reservationId, 'PAYMENT_PROOF_SUBMITTED', request, {}, 'PAYMENT_PROOF', String(proof.id));
          return proof;
        });
      } catch (error) {
        await reconcileStoredProof(stored.storageKey);
        if (duplicateReference(error)) throw new AppError(409, 'Transaction reference has already been used.');
        throw error;
      }
    },
    async listCustomerProofs(customerId: number, reservationId: number): Promise<PaymentProofRecord[]> {
      positiveId(customerId); positiveId(reservationId);
      requirePossibleBooking(customerId, reservationId);
      const request = await deps.readRequest();
      if (!await customerOwnsReservation(customerId, reservationId, request)) throw new AppError(404, 'Booking not found.');
      return listProofs(customerId, reservationId, request);
    },
    async openAuthorizedProof(actor: Actor, proofId: number): Promise<{ proof: PaymentProofRecord; stream: Awaited<ReturnType<ProofStorage['open']>> }> {
      if (!actor || !['CUSTOMER', 'ADMIN'].includes(actor.type)) throw new AppError(401, 'Authentication required.');
      positiveId(actor.id); positiveId(proofId);
      const request = await deps.readRequest();
      const proof = await findProof(proofId, request);
      if (!proof || (actor.type === 'CUSTOMER' && (proof.customerId !== actor.id ||
        !await customerOwnsReservation(actor.id, proof.reservationId, request)))) throw new AppError(404, 'Payment proof not found.');
      return { proof, stream: await deps.storage.open(proof.storageKey) };
    }
  };
}

export const paymentProofService = createPaymentProofService({
  storage: proofStorage,
  readRequest: async () => (await getDbPool()).request(),
  transaction: runBookingStatusTransaction
});

export const submitCustomerProof = paymentProofService.submitCustomerProof;
export const listCustomerProofs = paymentProofService.listCustomerProofs;
export const openAuthorizedProof = paymentProofService.openAuthorizedProof;
