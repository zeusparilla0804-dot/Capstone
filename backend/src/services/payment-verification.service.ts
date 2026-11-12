import type sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { writeAdminAudit } from '../repositories/audit.repository.js';
import { lockedBookingStatus, runBookingStatusTransaction } from '../repositories/booking-status.repository.js';
import { creditProofPayment, findProof, insertProofCredit, listReviewProofs, lockedPayment, lockedProof,
  lockedProofInvoice, markProofReviewed, proofReviewContext, setProofInvoiceStatus } from '../repositories/payment-proof.repository.js';
import type { PageResult, ProofReviewDetail, ProofReviewQuery, PublicPaymentProof } from '../types/admin.types.js';
import type { PaymentProofRecord } from '../types/payment-proof.types.js';
import { AppError } from '../utils/app-error.js';
import { isoDate } from '../utils/validation.js';
import { transitionBooking } from './booking-status.service.js';
import { queueBookingNotification } from './notification.service.js';
import { hasRequiredReservationDeposit, requiredReservationDeposit } from './reservation-billing-policy.js';
import { assertSupportedPaymentMethod } from './payment-method-policy.js';

interface Dependencies {
  readRequest: () => sql.Request | Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
}

function positiveId(value: number, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new AppError(400, 'Invalid identifier.');
}

function reviewReason(value: unknown, required = false): string | undefined {
  if (value !== undefined && typeof value !== 'string') throw new AppError(400, 'Review reason is invalid.');
  const reason = (value as string | undefined)?.trim();
  if ((reason?.length ?? 0) > 1000) throw new AppError(400, 'Review reason must be at most 1000 characters.');
  if (required && !reason) throw new AppError(400, 'A review reason is required.');
  return reason || undefined;
}

function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 9_999_999_999.99 || value !== Math.round(value * 100) / 100) {
    throw new AppError(400, 'Verified amount must be positive money with at most two decimal places.');
  }
  return value;
}

function queryInput(raw: unknown): ProofReviewQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, 'Proof filters are invalid.');
  const value = raw as Record<string, unknown>;
  function integer(name: string, fallback: number, max: number): number {
    const input = value[name];
    if (input === undefined) return fallback;
    if ((typeof input !== 'string' && typeof input !== 'number') || !/^[1-9]\d*$/.test(String(input))) throw new AppError(400, `${name} is invalid.`);
    const number = Number(input); positiveId(number, max); return number;
  }
  function text(name: string, fallback = ''): string {
    if (value[name] === undefined) return fallback;
    if (typeof value[name] !== 'string') throw new AppError(400, `${name} is invalid.`);
    return (value[name] as string).trim();
  }
  const page = integer('page', 1, 2_147_483_647), pageSize = integer('pageSize', 20, 100);
  if ((page - 1) * pageSize > 2_147_483_647) throw new AppError(400, 'Page offset is too large.');
  const search = text('search'); if (search.length > 200) throw new AppError(400, 'Search is too long.');
  const status = text('status', 'SUBMITTED').toUpperCase();
  if (!['SUBMITTED', 'VERIFIED', 'REJECTED', 'SUPERSEDED', 'ALL'].includes(status)) throw new AppError(400, 'Proof status is invalid.');
  const reservationId = value['reservationId'] === undefined ? undefined : integer('reservationId', 1, 2_147_483_647);
  const method = text('method').toUpperCase();
  if (!['', 'CASH', 'BANK_TRANSFER', 'E_WALLET'].includes(method)) throw new AppError(400, 'Proof method is invalid.');
  function date(name: string): string {
    const input = text(name); if (!input) return '';
    const parsed = isoDate(input, name); if (parsed.startsWith('0000-')) throw new AppError(400, `${name} is invalid.`); return parsed;
  }
  const exact = date('date'), dateFrom = date('dateFrom'), dateTo = date('dateTo');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new AppError(400, 'Date range is invalid.');
  const order = text('order', 'oldest');
  if (order !== 'oldest' && order !== 'newest') throw new AppError(400, 'Proof order is invalid.');
  return { page, pageSize, search, reservationId, status: status as ProofReviewQuery['status'], method: method as ProofReviewQuery['method'],
    date: exact, dateFrom, dateTo, order };
}

function publicProof(proof: PaymentProofRecord): PublicPaymentProof {
  return { id: proof.id, reservationId: proof.reservationId, customerId: proof.customerId, paymentId: proof.paymentId,
    paymentTransactionId: proof.paymentTransactionId, invoiceId: proof.invoiceId, method: proof.method,
    claimedAmount: proof.claimedAmount, transactionReference: proof.transactionReference, paymentDate: proof.paymentDate,
    originalFilename: (proof.originalFilename.split(/[\\/]/).at(-1) || 'payment-proof').replace(/[\x00-\x1f\x7f]/g, '_'),
    mimeType: proof.mimeType, byteSize: proof.byteSize, status: proof.status, rejectionReason: proof.rejectionReason,
    reviewedBy: proof.reviewedBy, reviewedAt: proof.reviewedAt, verifiedAmount: proof.verifiedAmount, correctionReason: proof.correctionReason,
    createdAt: proof.createdAt, updatedAt: proof.updatedAt, fileUrl: `/api/payment-proofs/${proof.id}/file` };
}

function conflict(): AppError { return new AppError(409, 'Payment proof or booking changed. Refresh the review queue and try again.'); }

export function createPaymentVerificationService(deps: Dependencies) {
  async function review(adminId: number, proofId: number, amount: number | undefined, reason: string | undefined): Promise<PublicPaymentProof> {
    const initial = await findProof(proofId, await deps.readRequest());
    if (!initial) throw new AppError(404, 'Payment proof not found.');
    try {
      return await deps.transaction(async request => {
        // Shared with customer submission/replacement: reservation -> payment -> proof.
        const booking = await lockedBookingStatus(initial.reservationId, request);
        if (!booking || !['PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'].includes(booking.status)) throw conflict();
        const payment = await lockedPayment(initial.reservationId, request);
        if (!payment) throw new AppError(409, 'Booking has no payment aggregate. Refresh the booking.');
        const proof = await lockedProof(proofId, request);
        if (!proof || proof.id !== proofId || proof.reservationId !== initial.reservationId ||
          proof.customerId !== booking.customerId || proof.paymentId !== Number(payment.paymentId) || proof.status !== 'SUBMITTED') throw conflict();
        const dueCents = Math.round(Number(payment.amountDue) * 100), paidCents = Math.round(Number(payment.amountPaid) * 100);
        const outstanding = dueCents - paidCents;
        let transactionId: string | undefined, invoiceId: number | undefined;
        if (amount !== undefined) {
          assertSupportedPaymentMethod(proof.method);
          if (outstanding <= 0) throw new AppError(409, 'Booking has no outstanding balance. Refresh the booking.');
          const cents = Math.round(amount * 100);
          if (cents > outstanding) throw new AppError(409, 'Verified amount exceeds the current outstanding balance. Refresh and correct the amount.');
          if (cents !== Math.round(proof.claimedAmount * 100) && !reason) throw new AppError(400, 'A correction reason is required when the verified amount differs from the claim.');
          transactionId = await insertProofCredit(adminId, Number(payment.paymentId), proof, amount, request);
          if (!await creditProofPayment(request)) throw conflict();
          const invoice = await lockedProofInvoice(proof.reservationId, request);
          invoiceId = invoice ? Number(invoice.id) : undefined;
          if (invoice && invoice.status !== 'CANCELLED') {
            if (!await setProofInvoiceStatus(invoiceId!, paidCents + cents >= Math.round(Number(invoice.totalAmount) * 100) ? 'PAID' : 'PARTIALLY_PAID', request)) throw conflict();
          }
        }
        const status = amount === undefined ? 'REJECTED' : 'VERIFIED';
        if (!await markProofReviewed({ proofId, reservationId: proof.reservationId, adminId, status, reason,
          amount, transactionId, invoiceId }, request)) throw conflict();
        const cumulativePaid = (paidCents + (amount === undefined ? 0 : Math.round(amount * 100))) / 100;
        const nextStatus = status === 'VERIFIED' && hasRequiredReservationDeposit(Number(payment.amountDue), cumulativePaid)
          ? 'PAYMENT_VERIFIED'
          : 'AWAITING_PAYMENT';
        if (booking.status === 'PAYMENT_SUBMITTED') {
          await transitionBooking({ reservationId: proof.reservationId, expectedStatus: 'PAYMENT_SUBMITTED',
            nextStatus, actor: { type: 'ADMIN', id: adminId }, reason, request });
        }
        // ADMIN_AUDIT_LOG.entity_id is int; proof IDs are bigint, so anchor on booking.
        await writeAdminAudit({ adminId, action: `PAYMENT_PROOF_${status}`, entityType: 'BOOKING', entityId: proof.reservationId,
          oldValues: { proofId, status: proof.status, amountPaid: paidCents / 100 },
          newValues: { proofId, status, verifiedAmount: amount ?? null, reason: reason ?? null,
            paymentTransactionId: transactionId ?? null, invoiceId: invoiceId ?? null,
            amountPaid: cumulativePaid } }, request);
        await queueBookingNotification(proof.reservationId,
          status === 'VERIFIED' ? 'PAYMENT_PROOF_VERIFIED' : 'PAYMENT_PROOF_REJECTED', request,
          status === 'VERIFIED' ? { amount: amount!.toFixed(2), amountPaid: cumulativePaid.toFixed(2),
            requiredDeposit: requiredReservationDeposit(Number(payment.amountDue)).toFixed(2),
            remainingDeposit: Math.max(0, requiredReservationDeposit(Number(payment.amountDue)) - cumulativePaid).toFixed(2),
            remainingBalance: ((dueCents - Math.round(cumulativePaid * 100)) / 100).toFixed(2),
            ...(reason ? { correctionReason: reason.replace(/\s+/g, ' ') } : {}) } : {}, 'PAYMENT_PROOF', String(proof.id));
        // Read through the already-held proof lock, before commit, for server review timestamps.
        const reviewed = await lockedProof(proofId, request);
        if (!reviewed) throw conflict();
        return publicProof(reviewed);
      });
    } catch (error) {
      const dbError = error as { number?: number; originalError?: { info?: { number?: number } } };
      if ([2601, 2627].includes(dbError?.number ?? dbError?.originalError?.info?.number ?? 0)) {
        throw new AppError(409, 'This payment or reference has already been recorded. Refresh the booking before reviewing again.');
      }
      throw error;
    }
  }

  return {
    async listPendingProofs(raw: unknown = {}): Promise<PageResult<PublicPaymentProof>> {
      const query = queryInput(raw);
      const page = await listReviewProofs(query, await deps.readRequest());
      return { ...page, items: page.items.map(publicProof) };
    },
    async getProofForReview(proofId: number): Promise<ProofReviewDetail> {
      positiveId(proofId);
      const request = await deps.readRequest();
      const proof = await findProof(proofId, request);
      if (!proof) throw new AppError(404, 'Payment proof not found.');
      const context = await proofReviewContext(proof.reservationId, request);
      if (!context) throw new AppError(404, 'Booking not found.');
      return { proof: publicProof(proof),
        booking: { id: Number(context.reservationId), reference: context.bookingReference, status: context.bookingStatus,
          eventDate: new Date(context.eventDate).toISOString().slice(0, 10) },
        customer: { id: Number(context.customerId), name: context.customerName, email: context.customerEmail },
        payment: context.paymentId == null ? undefined : (() => {
          const amountDue = Number(context.amountDue);
          const amountPaid = Number(context.amountPaid);
          const requiredDeposit = requiredReservationDeposit(amountDue);
          return { id: Number(context.paymentId), amountDue, amountPaid, status: context.paymentStatus,
            requiredDeposit,
            remainingDeposit: Math.max(0, Math.round((requiredDeposit - amountPaid) * 100) / 100),
            outstandingBalance: (Math.round(amountDue * 100) - Math.round(amountPaid * 100)) / 100 };
        })(),
        invoice: context.invoiceId == null ? undefined : { id: Number(context.invoiceId), number: context.invoiceNumber,
          totalAmount: Number(context.invoiceTotal), status: context.invoiceStatus } };
    },
    async verifyProof(adminId: number, proofId: number, verifiedAmount: unknown, rawReason?: unknown): Promise<PublicPaymentProof> {
      positiveId(adminId, 2_147_483_647); positiveId(proofId);
      const amount = money(verifiedAmount), reason = reviewReason(rawReason);
      return review(adminId, proofId, amount, reason);
    },
    async rejectProof(adminId: number, proofId: number, rawReason: unknown): Promise<PublicPaymentProof> {
      positiveId(adminId, 2_147_483_647); positiveId(proofId);
      return review(adminId, proofId, undefined, reviewReason(rawReason, true));
    }
  };
}

export const paymentVerificationService = createPaymentVerificationService({
  readRequest: async () => (await getDbPool()).request(), transaction: runBookingStatusTransaction
});
export const { listPendingProofs, getProofForReview, verifyProof, rejectProof } = paymentVerificationService;
