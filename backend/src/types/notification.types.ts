export type EmailOutboxStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

export type EmailTemplateKey =
  | 'BOOKING_RECEIVED'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_PROOF_SUBMITTED'
  | 'PAYMENT_PROOF_VERIFIED'
  | 'PAYMENT_PROOF_REJECTED'
  | 'PAYMENT_RECORDED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_COMPLETED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED';

export interface EmailOutboxRecord {
  id: string;
  recipient: string;
  normalizedRecipient: string;
  templateKey: EmailTemplateKey;
  payload: Record<string, unknown>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  status: EmailOutboxStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  sentAt?: string;
  updatedAt: string;
}

export interface QueueNotificationInput {
  recipient: string;
  templateKey: EmailTemplateKey;
  payload: Record<string, unknown>;
  relatedEntityType?: 'BOOKING' | 'INVOICE' | 'PAYMENT_PROOF';
  relatedEntityId?: string;
}

export interface RenderedEmail { subject: string; text: string; html: string; }
export interface BatchResult { disabled: boolean; claimed: number; sent: number; retried: number; failed: number; }
export interface EmailWorkerSettings {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryCapMs: number;
  leaseMs: number;
}
