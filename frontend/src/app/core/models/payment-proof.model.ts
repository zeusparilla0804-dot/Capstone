export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;

export type PaymentProofMethod = 'CASH' | 'BANK_TRANSFER' | 'E_WALLET';
export type PaymentProofStatus = 'submitted' | 'verified' | 'rejected' | 'superseded';

export interface PaymentProofSubmission {
  readonly method: PaymentProofMethod;
  readonly claimedAmount: number;
  readonly transactionReference?: string;
  readonly paymentDate: string;
}

export interface PaymentProof extends PaymentProofSubmission {
  readonly id: string;
  readonly reservationId: number;
  readonly customerId: number;
  readonly paymentId?: number;
  readonly paymentTransactionId?: string;
  readonly invoiceId?: number;
  readonly originalFilename: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
  readonly status: PaymentProofStatus;
  readonly rejectionReason?: string;
  readonly correctionReason?: string;
  readonly reviewedBy?: number;
  readonly reviewedAt?: string;
  readonly verifiedAmount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
