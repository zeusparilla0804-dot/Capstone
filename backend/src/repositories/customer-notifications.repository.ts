import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { customerNotification, customerUpdateTemplates, type CustomerUpdateRow } from '../services/customer-notifications.service.js';

export async function customerUpdates(customerId: number) {
  const request = (await getDbPool()).request().input('customerId', sql.Int, customerId);
  const templates = customerUpdateTemplates.map((value, index) => {
    request.input(`template${index}`, sql.NVarChar(80), value); return `@template${index}`;
  }).join(',');
  const result = await request.query(`
    WITH updates AS (
      SELECT CONCAT('email:',o.notification_id) id,o.template_key templateKey,r.reservation_id bookingId,
        r.booking_reference reference,o.created_at createdAt
      FROM dbo.EMAIL_OUTBOX o
      LEFT JOIN dbo.INVOICE i ON o.related_entity_type='INVOICE' AND i.invoice_id=o.related_entity_id
      LEFT JOIN dbo.PAYMENT_PROOF pp ON o.related_entity_type='PAYMENT_PROOF' AND pp.payment_proof_id=o.related_entity_id
      JOIN dbo.RESERVATION r ON r.reservation_id=CASE WHEN o.related_entity_type='BOOKING' THEN o.related_entity_id
        WHEN o.related_entity_type='INVOICE' THEN i.reservation_id WHEN o.related_entity_type='PAYMENT_PROOF' THEN pp.reservation_id END
      WHERE r.customer_id=@customerId AND o.template_key IN (${templates})
      UNION ALL
      SELECT CONCAT('qr:',a.reservation_id,':',CONVERT(varchar(33),a.assigned_at,126)),
        'PAYMENT_QR_READY',r.reservation_id,r.booking_reference,a.assigned_at
      FROM dbo.BOOKING_PAYMENT_DESTINATION a JOIN dbo.RESERVATION r ON r.reservation_id=a.reservation_id
      JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
      JOIN dbo.PAYMENT_DESTINATION d ON d.destination_id=a.destination_id
      WHERE r.customer_id=@customerId AND d.is_available=1 AND d.method=p.payment_method
        AND r.status IN ('AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED','COMPLETED')
    ) SELECT TOP(80) u.*,CAST(CASE WHEN seen.notification_key IS NULL THEN 0 ELSE 1 END AS bit) isRead
      FROM updates u LEFT JOIN dbo.CUSTOMER_NOTIFICATION_READ seen
        ON seen.customer_id=@customerId AND seen.notification_key=u.id ORDER BY u.createdAt DESC,u.id DESC`);
  return result.recordset.map(row => customerNotification({ ...row, id: String(row.id), bookingId: Number(row.bookingId),
    createdAt: new Date(row.createdAt).toISOString(), isRead: !!row.isRead } as CustomerUpdateRow)).filter(item => item !== null);
}

export async function markCustomerUpdatesRead(customerId: number, ids: readonly string[]) {
  // Only keys in this customer's feed may be acknowledged.
  const own = new Set((await customerUpdates(customerId)).map(item => item.id));
  const keys = [...new Set(ids)].filter(id => own.has(id));
  if (!keys.length) return;
  const request = (await getDbPool()).request().input('customerId', sql.Int, customerId);
  const values = keys.map((key, index) => { request.input(`key${index}`, sql.NVarChar(120), key); return `(@key${index})`; }).join(',');
  await request.query(`MERGE dbo.CUSTOMER_NOTIFICATION_READ WITH(HOLDLOCK) target
    USING (SELECT @customerId customer_id,v.notification_key FROM (VALUES ${values}) v(notification_key)) source
    ON target.customer_id=source.customer_id AND target.notification_key=source.notification_key
    WHEN NOT MATCHED THEN INSERT(customer_id,notification_key) VALUES(source.customer_id,source.notification_key);`);
}
