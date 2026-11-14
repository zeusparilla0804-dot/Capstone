import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { AdminNotification, AdminNotificationRepository } from '../types/admin-notification.types.js';
import { formatEventTimeChange } from '../utils/event-time.js';

// Keep source identities independent of mutable display text and current status.
// Read acknowledgements use this same complete, administrator-scoped feed.
const feedCte = `WITH feed AS (
  SELECT CONCAT('reservation:',r.reservation_id) id,'RESERVATION_SUBMITTED' type,
    'Reservation submitted' title,CONCAT(c.first_name,' ',c.last_name,' submitted a reservation.') message,
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)) reference,
    DATEADD(minute,-@serverOffset,r.created_at) createdAt,
    CONCAT('/admin/bookings/',r.reservation_id) link
  FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
  UNION ALL
  SELECT CONCAT('history:',h.booking_status_history_id),
    CASE WHEN h.reason LIKE 'Payment method %' THEN 'PAYMENT_METHOD_CHANGED' ELSE 'RESERVATION_UPDATED' END,
    CASE WHEN h.reason LIKE 'Payment method %' THEN 'Payment method selected'
      WHEN h.next_status='CANCELLED' THEN 'Reservation cancelled'
      WHEN h.next_status='CONFIRMED' THEN 'Reservation confirmed'
      WHEN h.next_status='COMPLETED' THEN 'Event completed'
      WHEN h.next_status='APPROVED' THEN 'Reservation approved'
      WHEN h.next_status='REJECTED' THEN 'Reservation rejected' ELSE 'Reservation updated' END,
    CONCAT(CASE h.actor_type WHEN 'CUSTOMER' THEN 'Customer' WHEN 'ADMIN' THEN 'Administrator' ELSE 'System' END,
      ' · ',COALESCE(h.reason,CONCAT(h.previous_status,' → ',h.next_status))),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),h.created_at,
    CONCAT('/admin/bookings/',r.reservation_id)
  FROM dbo.BOOKING_STATUS_HISTORY h JOIN dbo.RESERVATION r ON r.reservation_id=h.reservation_id
  WHERE h.previous_status IS NOT NULL
    AND NOT(h.next_status='PAYMENT_SUBMITTED' AND EXISTS(
      SELECT 1 FROM dbo.PAYMENT_PROOF pp WHERE pp.reservation_id=h.reservation_id))
    AND NOT(h.actor_type='ADMIN' AND COALESCE(h.reason,'') LIKE 'Event time adjusted from %')
  UNION ALL
  SELECT CONCAT('proof:',pp.payment_proof_id),'PAYMENT_PROOF_SUBMITTED','Payment proof submitted',
    CONCAT('Payment proof uploaded · PHP ',CONVERT(varchar(30),pp.claimed_amount)),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),pp.created_at,
    CONCAT('/admin/payments/proofs/',pp.payment_proof_id)
  FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id
  UNION ALL
  SELECT CONCAT('superseded:',pp.payment_proof_id),'PAYMENT_PROOF_SUPERSEDED','Payment proof superseded',
    'An earlier payment proof was superseded.',
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),pp.updated_at,
    CONCAT('/admin/payments/proofs/',pp.payment_proof_id)
  FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id
  WHERE pp.status='SUPERSEDED'
  UNION ALL
  SELECT CONCAT('rejection:',pp.payment_proof_id),'PAYMENT_PROOF_REJECTED','Payment proof rejected',
    COALESCE(pp.rejection_reason,'Payment proof was rejected.'),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),pp.reviewed_at,
    CONCAT('/admin/payments/proofs/',pp.payment_proof_id)
  FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id
  WHERE pp.status='REJECTED' AND pp.reviewed_at IS NOT NULL
  UNION ALL
  SELECT CONCAT('transaction:',pt.payment_transaction_id),
    CASE WHEN proof.payment_proof_id IS NOT NULL THEN 'PAYMENT_VERIFIED' ELSE 'PAYMENT_RECORDED' END,
    CASE WHEN proof.payment_proof_id IS NOT NULL THEN 'Payment proof verified' ELSE 'Payment recorded' END,
    CONCAT('PHP ',CONVERT(varchar(30),pt.amount),' recorded · ',pt.payment_method),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),DATEADD(minute,-@serverOffset,pt.created_at),
    CASE WHEN proof.payment_proof_id IS NOT NULL THEN CONCAT('/admin/payments/proofs/',proof.payment_proof_id)
      ELSE CONCAT('/admin/bookings/',r.reservation_id) END
  FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id
  JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
  OUTER APPLY (SELECT TOP(1) pp.payment_proof_id FROM dbo.PAYMENT_PROOF pp
    WHERE pp.payment_transaction_id=pt.payment_transaction_id ORDER BY pp.payment_proof_id) proof
  UNION ALL
  SELECT CONCAT('invoice:',i.invoice_id),'INVOICE_ISSUED','Invoice issued',
    CONCAT('Invoice ',i.invoice_number,' issued.'),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),DATEADD(minute,-@serverOffset,i.issued_at),
    CONCAT('/admin/invoices/',i.invoice_id)
  FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
  UNION ALL
  SELECT CONCAT('time:',a.audit_id),'EVENT_TIME_UPDATED','Event time adjusted by admin',
    CONCAT(JSON_VALUE(a.old_values,'$.eventTime'),' → ',JSON_VALUE(a.new_values,'$.eventTime')),
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),DATEADD(minute,-@serverOffset,a.created_at),
    CONCAT('/admin/bookings/',r.reservation_id)
  FROM dbo.ADMIN_AUDIT_LOG a JOIN dbo.RESERVATION r ON r.reservation_id=a.entity_id
  WHERE a.entity_type='BOOKING' AND a.action='BOOKING_TIME_UPDATED'
  UNION ALL
  SELECT CONCAT('email-failure:',o.notification_id,':',o.attempt_count),'EMAIL_FAILED','Email notification failed',
    'An email notification could not be delivered. Review the email outbox.',CONCAT('Email #',o.notification_id),o.updated_at,
    '/admin/email-outbox?status=FAILED'
  FROM dbo.EMAIL_OUTBOX o WHERE o.status='FAILED'
  UNION ALL
  SELECT CONCAT('customer:',c.customer_id),'CUSTOMER_REGISTERED','Customer registered',
    CONCAT(c.first_name,' ',c.last_name,' registered an account.'),CONCAT('Customer #',c.customer_id),
    DATEADD(minute,-@serverOffset,c.created_at),CONCAT('/admin/customers/',c.customer_id)
  FROM dbo.CUSTOMER c
  UNION ALL
  SELECT CONCAT('L-',n.notification_id),'ADMIN_MESSAGE','Administrator notification',n.message,
    COALESCE(r.booking_reference,CONCAT('Reservation #',r.reservation_id)),DATEADD(minute,-@serverOffset,n.sent_at),
    CONCAT('/admin/bookings/',r.reservation_id)
  FROM dbo.NOTIFICATION n JOIN dbo.RESERVATION r ON r.reservation_id=n.reservation_id
  WHERE n.recipient_type='ADMIN' AND n.recipient_id=@adminId
    AND LEN(LTRIM(RTRIM(n.message)))>0
)`;

const readFeedCte = `${feedCte}, readFeed AS (
  SELECT f.*,CAST(CASE WHEN seen.notification_key IS NULL THEN 0 ELSE 1 END AS bit) isRead
  FROM feed f LEFT JOIN dbo.ADMIN_NOTIFICATION_READ seen ON seen.admin_id=@adminId AND seen.notification_key=f.id
)`;

function notification(row: Record<string, unknown>): AdminNotification {
  return {
    id: String(row['id']), type: String(row['type']), title: String(row['title']),
    message: row['type'] === 'EVENT_TIME_UPDATED' ? formatEventTimeChange(String(row['message'] ?? '')) : String(row['message'] ?? ''),
    reference: String(row['reference'] ?? ''), createdAt: row['createdAt'] == null ? null : new Date(row['createdAt'] as string | Date).toISOString(),
    isRead: !!row['isRead'], link: String(row['link']),
  };
}

export function createAdminNotificationRepository(deps: { request(): Promise<sql.Request> }): AdminNotificationRepository {
  return {
    async list(adminId, query) {
      const result = await (await deps.request()).replaceInput('adminId', sql.Int, adminId)
        .replaceInput('unreadOnly', sql.Bit, query.unreadOnly)
        .replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
        .replaceInput('pageSize', sql.Int, query.pageSize).query(`
          DECLARE @serverOffset int=DATEPART(TZOFFSET,SYSDATETIMEOFFSET());
          DECLARE @notificationFeed TABLE (
            id nvarchar(120) NOT NULL,type nvarchar(80) NOT NULL,title nvarchar(200) NOT NULL,
            message nvarchar(max) NOT NULL,reference nvarchar(120) NOT NULL,createdAt datetime2 NULL,
            isRead bit NOT NULL,link nvarchar(500) NOT NULL
          );
          ${readFeedCte}
          INSERT INTO @notificationFeed(id,type,title,message,reference,createdAt,isRead,link)
          SELECT id,type,title,message,reference,createdAt,isRead,link FROM readFeed;
          SELECT COALESCE(SUM(CASE WHEN @unreadOnly=0 OR isRead=0 THEN 1 ELSE 0 END),0) totalItems,
            COALESCE(SUM(CASE WHEN isRead=0 THEN 1 ELSE 0 END),0) unreadCount FROM @notificationFeed;
          SELECT id,type,title,message,reference,createdAt,isRead,link FROM @notificationFeed WHERE @unreadOnly=0 OR isRead=0
          ORDER BY createdAt DESC,id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
      const sets = result.recordsets as unknown as Record<string, unknown>[][];
      const totalItems = Number(sets[0]?.[0]?.['totalItems'] ?? 0);
      return { items: (sets[1] ?? []).map(notification), page: query.page, pageSize: query.pageSize,
        totalItems, totalPages: Math.ceil(totalItems / query.pageSize), unreadCount: Number(sets[0]?.[0]?.['unreadCount'] ?? 0) };
    },
    async markRead(adminId, ids) {
      const keys = [...new Set(ids)];
      if (!keys.length) return;
      const request = (await deps.request()).replaceInput('adminId', sql.Int, adminId);
      const values = keys.map((key, index) => {
        request.replaceInput(`key${index}`, sql.NVarChar(120), key);
        return `(@key${index})`;
      }).join(',');
      await request.query(`DECLARE @serverOffset int=DATEPART(TZOFFSET,SYSDATETIMEOFFSET());
        ${feedCte}
        MERGE dbo.ADMIN_NOTIFICATION_READ WITH(HOLDLOCK) target
        USING (SELECT @adminId admin_id,v.notification_key FROM (VALUES ${values}) v(notification_key)
          JOIN feed f ON f.id=v.notification_key) source
        ON target.admin_id=source.admin_id AND target.notification_key=source.notification_key
        WHEN NOT MATCHED THEN INSERT(admin_id,notification_key) VALUES(source.admin_id,source.notification_key);`);
    },
  };
}

export const adminNotificationRepository = createAdminNotificationRepository({ request: async () => (await getDbPool()).request() });
