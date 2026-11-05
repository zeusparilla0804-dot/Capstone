import sql from 'mssql';
import { getDbPool } from '../config/database.js';

interface EventReminderRepositoryDependencies {
  readRequest: () => sql.Request | Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
}

function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error('Invalid event reminder date.');
  }
  return value;
}

export function createEventReminderRepository(deps: EventReminderRepositoryDependencies) {
  return {
    async queueDue(fromDate: string, throughDate: string): Promise<number> {
      const start = isoDate(fromDate);
      const end = isoDate(throughDate);
      if (end < start) throw new Error('Invalid event reminder window.');
      return deps.transaction(async request => {
        const result = await request
          .replaceInput('fromDate', sql.Date, start)
          .replaceInput('throughDate', sql.Date, end)
          .replaceInput('templateKey', sql.NVarChar(80), 'UPCOMING_EVENT_REMINDER')
          .replaceInput('relatedEntityType', sql.NVarChar(50), 'BOOKING')
          .query(`/* queue upcoming event reminders */
            INSERT dbo.EMAIL_OUTBOX(
              recipient,normalized_recipient,template_key,payload,related_entity_type,related_entity_id,
              status,attempt_count,next_attempt_at)
            SELECT c.email,LOWER(c.email),@templateKey,
              (SELECT CONCAT(c.first_name,' ',c.last_name) customerName,
                r.booking_reference bookingReference,CONVERT(varchar(10),r.event_date,23) eventDate
                FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),
              @relatedEntityType,r.reservation_id,'PENDING',0,SYSUTCDATETIME()
            FROM dbo.RESERVATION r
            JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
            WHERE r.status='CONFIRMED'
              AND c.status='ACTIVE'
              AND r.event_date BETWEEN @fromDate AND @throughDate
              AND NOT EXISTS(
                SELECT 1 FROM dbo.EMAIL_OUTBOX existing WITH(UPDLOCK,HOLDLOCK)
                WHERE existing.template_key=@templateKey
                  AND existing.related_entity_type=@relatedEntityType
                  AND existing.related_entity_id=r.reservation_id
              )`);
        return result.rowsAffected[0] ?? 0;
      });
    },

    async isDeliverable(reservationId: number, eventDate: string, today: string): Promise<boolean> {
      if (!Number.isSafeInteger(reservationId) || reservationId < 1) return false;
      const result = await (await deps.readRequest())
        .replaceInput('reservationId', sql.Int, reservationId)
        .replaceInput('eventDate', sql.Date, isoDate(eventDate))
        .replaceInput('today', sql.Date, isoDate(today))
        .query<{ deliverable: boolean }>(`/* validate upcoming event reminder */
          SELECT TOP (1) CAST(1 AS bit) deliverable FROM dbo.RESERVATION r
          JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
          WHERE r.reservation_id=@reservationId AND r.status='CONFIRMED' AND c.status='ACTIVE'
            AND r.event_date=@eventDate AND r.event_date>=@today`);
      return Boolean(result.recordset[0]?.deliverable);
    }
  };
}

async function transaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const value = await work(new sql.Request(transaction));
    await transaction.commit();
    return value;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  }
}

export const eventReminderRepository = createEventReminderRepository({
  readRequest: async () => (await getDbPool()).request(),
  transaction
});
