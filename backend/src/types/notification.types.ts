export type EmailOutboxStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';

export type EmailTemplateKey =
  | 'ACCOUNT_REGISTERED'
  | 'EMAIL_VERIFICATION_CODE'
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
  | 'UPCOMING_EVENT_REMINDER'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED'
  | 'CUSTOM_REQUEST_RECEIVED'
  | 'CUSTOM_REQUEST_RECEIVED_ADMIN'
  | 'CUSTOM_CLARIFICATION_REQUESTED'
  | 'CUSTOM_QUOTE_SENT'
  | 'CUSTOM_QUOTE_ACCEPTED'
  | 'CUSTOM_QUOTE_DECLINED'
  | 'CUSTOM_QUOTE_EXPIRED';

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
  relatedEntityType?: 'CUSTOMER' | 'BOOKING' | 'INVOICE' | 'PAYMENT_PROOF' | 'CUSTOM_EVENT_REQUEST';
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
