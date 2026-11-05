import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type {
  EmailOutboxRecord,
  EmailWorkerSettings,
  QueueNotificationInput
} from '../types/notification.types.js';

export interface BookingNotificationContext {
  customerEmail: string;
  customerName: string;
  bookingReference: string;
  eventDate: string;
  invoiceNumber?: string;
  invoiceId?: number;
  invoiceDueDate?: string;
  eventTime?: string;
  eventType?: string;
  venue?: string;
  status?: string;
  totalAmount?: number;
  amountPaid?: number;
  guestCount?: number;
  paymentMethod?: string;
}

export interface ClaimedEmail extends EmailOutboxRecord {
  attemptCount: number;
}

export interface EmailOutboxRepository {
  insert(input: QueueNotificationInput, request?: sql.Request): Promise<string>;
  claim(now: Date, settings: EmailWorkerSettings): Promise<ClaimedEmail[]>;
  finish(claimed: ClaimedEmail, outcome: EmailFinishOutcome, now: Date): Promise<boolean>;
  findById(id: string): Promise<EmailOutboxRecord | undefined>;
  bookingContext(reservationId: number, request: sql.Request): Promise<BookingNotificationContext | undefined>;
}

export type EmailFinishOutcome =
  | { status: 'SENT' }
  | { status: 'PENDING'; error: string; nextAttemptAt: Date }
  | { status: 'FAILED'; error: string };

interface Dependencies {
  readRequest: () => sql.Request | Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
}

function dateValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return new Date(value as string | Date).toISOString();
}

function record(row: Record<string, unknown>): EmailOutboxRecord {
  return {
    id: String(row.id),
    recipient: String(row.recipient),
    normalizedRecipient: String(row.normalizedRecipient),
    templateKey: row.templateKey as EmailOutboxRecord['templateKey'],
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) as Record<string, unknown> : row.payload as Record<string, unknown>,
    relatedEntityType: row.relatedEntityType == null ? undefined : String(row.relatedEntityType),
    relatedEntityId: row.relatedEntityId == null ? undefined : String(row.relatedEntityId),
    status: row.status as EmailOutboxRecord['status'],
    attemptCount: Number(row.attemptCount),
    nextAttemptAt: dateValue(row.nextAttemptAt),
    lastError: row.lastError == null ? undefined : String(row.lastError),
    createdAt: dateValue(row.createdAt)!,
    sentAt: dateValue(row.sentAt),
    updatedAt: dateValue(row.updatedAt)!
  };
}

const projection = `CONVERT(varchar(20), notification_id) id,recipient,normalized_recipient normalizedRecipient,
  template_key templateKey,payload,related_entity_type relatedEntityType,
  CONVERT(varchar(20), related_entity_id) relatedEntityId,status,attempt_count attemptCount,
  next_attempt_at nextAttemptAt,last_error lastError,created_at createdAt,sent_at sentAt,updated_at updatedAt`;

export function createEmailOutboxRepository(deps: Dependencies): EmailOutboxRepository {
  return {
    async insert(input, suppliedRequest) {
      const request = suppliedRequest ?? await deps.readRequest();
      const result = await request
        .replaceInput('recipient', sql.NVarChar(320), input.recipient)
        .replaceInput('normalizedRecipient', sql.NVarChar(320), input.recipient.toLowerCase())
        .replaceInput('templateKey', sql.NVarChar(80), input.templateKey)
        .replaceInput('payload', sql.NVarChar(sql.MAX), JSON.stringify(input.payload))
        .replaceInput('relatedEntityType', sql.NVarChar(50), input.relatedEntityType ?? null)
        .replaceInput('relatedEntityId', sql.BigInt, input.relatedEntityId ?? null)
        .query<{ id: string }>(`INSERT dbo.EMAIL_OUTBOX(
          recipient,normalized_recipient,template_key,payload,related_entity_type,related_entity_id,status,attempt_count,next_attempt_at)
          OUTPUT CONVERT(varchar(20), INSERTED.notification_id) id
          VALUES(@recipient,@normalizedRecipient,@templateKey,@payload,@relatedEntityType,@relatedEntityId,'PENDING',0,sysutcdatetime())`);
      return String(result.recordset[0]!.id);
    },

    async claim(now, settings) {
      return deps.transaction(async request => {
        const leaseCutoff = new Date(now.getTime() - settings.leaseMs);
        const result = await request
          .replaceInput('now', sql.DateTime2, now)
          .replaceInput('leaseCutoff', sql.DateTime2, leaseCutoff)
          .replaceInput('batchSize', sql.Int, settings.batchSize)
          .query<Record<string, unknown>>(`;WITH due AS (
            SELECT TOP (@batchSize) * FROM dbo.EMAIL_OUTBOX WITH(UPDLOCK,READPAST,ROWLOCK)
            WHERE (status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at<=@now))
               OR (status='PROCESSING' AND updated_at<=@leaseCutoff)
            ORDER BY created_at,notification_id
          )
          UPDATE due SET status='PROCESSING',attempt_count=attempt_count+1,updated_at=@now
          OUTPUT CONVERT(varchar(20), INSERTED.notification_id) id,INSERTED.recipient,
            INSERTED.normalized_recipient normalizedRecipient,INSERTED.template_key templateKey,INSERTED.payload,
            INSERTED.related_entity_type relatedEntityType,CONVERT(varchar(20), INSERTED.related_entity_id) relatedEntityId,
            INSERTED.status,INSERTED.attempt_count attemptCount,INSERTED.next_attempt_at nextAttemptAt,
            INSERTED.last_error lastError,INSERTED.created_at createdAt,INSERTED.sent_at sentAt,INSERTED.updated_at updatedAt`);
        return result.recordset.map(row => record(row) as ClaimedEmail);
      });
    },

    async finish(claimed, outcome, now) {
      const sentAt = outcome.status === 'SENT' ? now : null;
      const nextAttemptAt = outcome.status === 'PENDING' ? outcome.nextAttemptAt : null;
      const lastError = outcome.status === 'SENT' ? null : outcome.error;
      const result = await (await deps.readRequest())
        .replaceInput('outboxId', sql.BigInt, claimed.id)
        .replaceInput('claimedAttempt', sql.Int, claimed.attemptCount)
        .replaceInput('outcome', sql.NVarChar(20), outcome.status)
        .replaceInput('lastError', sql.NVarChar(2000), lastError)
        .replaceInput('nextAttemptAt', sql.DateTime2, nextAttemptAt)
        .replaceInput('sentAt', sql.DateTime2, sentAt)
        .replaceInput('now', sql.DateTime2, now)
        .query(`UPDATE dbo.EMAIL_OUTBOX SET status=@outcome,last_error=@lastError,next_attempt_at=@nextAttemptAt,
          sent_at=@sentAt,updated_at=@now WHERE notification_id=@outboxId AND status='PROCESSING' AND attempt_count=@claimedAttempt`);
      return (result.rowsAffected[0] ?? 0) === 1;
    },

    async findById(id) {
      const result = await (await deps.readRequest())
        .replaceInput('outboxId', sql.BigInt, id)
        .query<Record<string, unknown>>(`SELECT ${projection} FROM dbo.EMAIL_OUTBOX WHERE notification_id=@outboxId`);
      return result.recordset[0] ? record(result.recordset[0]) : undefined;
    },

    async bookingContext(reservationId, request) {
      const result = await request
        .replaceInput('notificationReservationId', sql.Int, reservationId)
        .query<BookingNotificationContext>(`/* email outbox context */
          SELECT c.email customerEmail,CONCAT(c.first_name,' ',c.last_name) customerName,
            r.booking_reference bookingReference,CONVERT(varchar(10),r.event_date,23) eventDate,
            i.invoice_number invoiceNumber,i.invoice_id invoiceId,CONVERT(varchar(10),i.due_at,23) invoiceDueDate,
            CONVERT(varchar(5),r.event_time,108) eventTime,e.event_type eventType,r.venue_address venue,r.status,
            i.total_amount totalAmount,COALESCE(p.amount_paid,0) amountPaid,
            r.guest_count guestCount,p.payment_method paymentMethod
          FROM dbo.RESERVATION r
          JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
          JOIN dbo.EVENT e ON e.event_id=r.event_id
          LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id
          LEFT JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
          WHERE r.reservation_id=@notificationReservationId`);
      return result.recordset[0];
    }
  };
}

async function transaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  const tx = new sql.Transaction(await getDbPool());
  await tx.begin();
  try {
    const value = await work(new sql.Request(tx));
    await tx.commit();
    return value;
  } catch (error) {
    try { await tx.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  }
}

export const emailOutboxRepository = createEmailOutboxRepository({
  readRequest: async () => (await getDbPool()).request(),
  transaction
});
