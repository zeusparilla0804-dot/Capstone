export type EmailOutboxStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

export type EmailTemplateKey =
  | 'BOOKING_RECEIVED'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PAYMENT_PROOF_VERIFIED'
  | 'PAYMENT_PROOF_REJECTED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_COMPLETED';

export interface EmailOutboxRecord {
  id: number;
  recipient: string;
  normalizedRecipient: string;
  templateKey: EmailTemplateKey;
  payload: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: number;
  status: EmailOutboxStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
  updatedAt: string;
}
