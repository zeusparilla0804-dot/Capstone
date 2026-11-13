import type { PaymentBankSnapshot } from './payment-bank.types.js';

export type PaymentProofMethod = 'CASH' | 'BANK_TRANSFER' | 'E_WALLET';

export type PaymentProofStatus = 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED';

export interface PaymentProofSubmission {
  method: PaymentProofMethod;
  claimedAmount: number;
  transactionReference?: string;
  paymentDate: string;
  destinationId?: number;
  destinationVersion?: string;
  replacesProofId?: string;
}

export interface PaymentProofRecord extends PaymentProofSubmission, Partial<PaymentBankSnapshot> {
  id: number;
  reservationId: number;
  customerId: number;
  paymentId?: number;
  paymentTransactionId?: string;
  invoiceId?: number;
  storageKey: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  status: PaymentProofStatus;
  rejectionReason?: string;
  correctionReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  verifiedAmount?: number;
  createdAt: string;
  updatedAt: string;
}
