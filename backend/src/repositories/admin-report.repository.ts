import sql from 'mssql';

import { getDbPool } from '../config/database.js';
import type {
  AdminCollectionReport, AdminPaymentReport, AdminReservationReport, CollectionReportItem, CollectionReportQuery,
  PaymentReportItem, PaymentReportQuery, ReservationReportItem, ReservationReportQuery,
} from '../types/admin-report.types.js';

interface Dependencies { readRequest(): Promise<sql.Request> }

const reservationColumns = `r.booking_reference reference,CONCAT(c.first_name,' ',c.last_name) customer,
  CONVERT(varchar(10),r.event_date,23) eventDate,CONVERT(varchar(5),r.event_time,108) eventTime,
  e.event_type eventType,r.guest_count guestCount,r.venue_address venue,COALESCE(p.package_name,'Custom event') packageName,r.status`;

const cancelledInvoice = "(r.status='CANCELLED' OR i.status='CANCELLED')";
const invoicePaymentStatus = `CASE WHEN ${cancelledInvoice} THEN 'CANCELLED' ELSE pay.status END`;
const activeOutstandingBalance = `CASE WHEN ${cancelledInvoice} THEN 0 WHEN i.total_amount>pay.amount_paid THEN i.total_amount-pay.amount_paid ELSE 0 END`;

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function reservationRow(row: Record<string, unknown>): ReservationReportItem {
  return {
    reference: String(row['reference'] ?? ''), customer: String(row['customer'] ?? ''),
    eventDate: String(row['eventDate'] ?? ''), eventTime: String(row['eventTime'] ?? ''),
    eventType: String(row['eventType'] ?? ''), guestCount: numberValue(row['guestCount']),
    venue: String(row['venue'] ?? ''), packageName: String(row['packageName'] ?? ''),
    status: String(row['status'] ?? '') as ReservationReportItem['status'],
  };
}

function paymentRow(row: Record<string, unknown>): PaymentReportItem {
  return {
    invoiceNumber: String(row['invoiceNumber'] ?? ''), bookingReference: String(row['bookingReference'] ?? ''),
    customer: String(row['customer'] ?? ''), issuedDate: String(row['issuedDate'] ?? ''),
    latestPaymentDate: String(row['latestPaymentDate'] ?? ''), method: String(row['method'] ?? ''),
    amountDue: numberValue(row['amountDue']), amountPaid: numberValue(row['amountPaid']),
    outstandingBalance: numberValue(row['outstandingBalance']), status: String(row['status'] ?? '') as PaymentReportItem['status'],
  };
}

function collectionRow(row: Record<string, unknown>): CollectionReportItem {
  return {
    id: String(row['id']),
    invoiceNumber: String(row['invoiceNumber'] ?? ''),
    bookingReference: String(row['bookingReference'] ?? ''),
    customer: String(row['customer'] ?? ''),
    paymentDate: String(row['paymentDate'] ?? ''),
    method: String(row['method'] ?? ''),
    amount: numberValue(row['amount']),
    source: row['source'] === 'legacy' ? 'legacy' : 'transaction',
  };
}

export function createAdminReportRepository(deps: Dependencies) {
  return {
    async reservations(filters: ReservationReportQuery): Promise<AdminReservationReport> {
      const result = await (await deps.readRequest())
        .replaceInput('dateFrom', sql.VarChar(10), filters.dateFrom)
        .replaceInput('dateTo', sql.VarChar(10), filters.dateTo)
        .replaceInput('status', sql.NVarChar(30), filters.status)
        .replaceInput('eventType', sql.NVarChar(100), filters.eventType)
        .query(`
          SELECT COUNT(*) reservationCount,COALESCE(SUM(r.guest_count),0) totalGuests
          FROM dbo.RESERVATION r JOIN dbo.EVENT e ON e.event_id=r.event_id
          WHERE r.event_date>=CONVERT(date,@dateFrom) AND r.event_date<=CONVERT(date,@dateTo)
            AND (@status='' OR r.status=@status) AND (@eventType='' OR e.event_type=@eventType);

          SELECT ${reservationColumns}
          FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
          JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id
          WHERE r.event_date>=CONVERT(date,@dateFrom) AND r.event_date<=CONVERT(date,@dateTo)
            AND (@status='' OR r.status=@status) AND (@eventType='' OR e.event_type=@eventType)
          ORDER BY r.event_date,r.event_time,r.reservation_id;

          SELECT ${reservationColumns}
          FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
          JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id
          WHERE r.event_date>=CONVERT(date,@dateFrom) AND r.event_date<=CONVERT(date,@dateTo)
            AND r.event_date>CONVERT(date,SYSUTCDATETIME()) AND r.status IN('APPROVED','CONFIRMED')
            AND (@eventType='' OR e.event_type=@eventType)
          ORDER BY r.event_date,r.event_time,r.reservation_id;
        `);
      const sets = (result.recordsets ?? []) as unknown as Record<string, unknown>[][];
      const summary = sets[0]?.[0] ?? {};
      return {
        filters,
        summary: { reservationCount: numberValue(summary['reservationCount']), totalGuests: numberValue(summary['totalGuests']) },
        items: (sets[1] ?? []).map(reservationRow),
        upcomingItems: (sets[2] ?? []).map(reservationRow),
      };
    },

    async payments(filters: PaymentReportQuery): Promise<AdminPaymentReport> {
      const result = await (await deps.readRequest())
        .replaceInput('dateFrom', sql.VarChar(10), filters.dateFrom)
        .replaceInput('dateTo', sql.VarChar(10), filters.dateTo)
        .replaceInput('status', sql.NVarChar(30), filters.status)
        .replaceInput('method', sql.NVarChar(50), filters.method)
        .query(`
          SELECT COALESCE(SUM(i.total_amount),0) totalBilled,COALESCE(SUM(pay.amount_paid),0) verifiedPayments,
            COALESCE(SUM(${activeOutstandingBalance}),0) outstandingBalance
          FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
          JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
          OUTER APPLY (SELECT TOP (1) pt.payment_method,pt.payment_date FROM dbo.PAYMENT_TRANSACTION pt
            WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC) latest
          WHERE i.issued_at>=CONVERT(date,@dateFrom) AND CONVERT(date,i.issued_at)<=CONVERT(date,@dateTo)
            AND (@status='' OR ${invoicePaymentStatus}=@status) AND (@method='' OR COALESCE(latest.payment_method,pay.payment_method)=@method);

          SELECT i.invoice_number invoiceNumber,r.booking_reference bookingReference,CONCAT(c.first_name,' ',c.last_name) customer,
            CONVERT(varchar(10),i.issued_at,23) issuedDate,CONVERT(varchar(10),COALESCE(latest.payment_date,pay.payment_date),23) latestPaymentDate,
            COALESCE(latest.payment_method,pay.payment_method,'') method,i.total_amount amountDue,pay.amount_paid amountPaid,
            ${activeOutstandingBalance} outstandingBalance,${invoicePaymentStatus} status
          FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
          JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
          OUTER APPLY (SELECT TOP (1) pt.payment_method,pt.payment_date FROM dbo.PAYMENT_TRANSACTION pt
            WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC) latest
          WHERE i.issued_at>=CONVERT(date,@dateFrom) AND CONVERT(date,i.issued_at)<=CONVERT(date,@dateTo)
            AND (@status='' OR ${invoicePaymentStatus}=@status) AND (@method='' OR COALESCE(latest.payment_method,pay.payment_method)=@method)
          ORDER BY i.issued_at,i.invoice_id;
        `);
      const sets = (result.recordsets ?? []) as unknown as Record<string, unknown>[][];
      const summary = sets[0]?.[0] ?? {};
      return {
        filters,
        summary: {
          totalBilled: numberValue(summary['totalBilled']),
          verifiedPayments: numberValue(summary['verifiedPayments']),
          outstandingBalance: numberValue(summary['outstandingBalance']),
        },
        items: (sets[1] ?? []).map(paymentRow),
      };
    },

    async collections(filters: CollectionReportQuery): Promise<AdminCollectionReport> {
      const result = await (await deps.readRequest())
        .replaceInput('dateFrom', sql.VarChar(10), filters.dateFrom)
        .replaceInput('dateTo', sql.VarChar(10), filters.dateTo)
        .replaceInput('method', sql.NVarChar(50), filters.method)
        .query<Record<string, unknown>>(`
          WITH credits AS (
            SELECT CONCAT('T-',pt.payment_transaction_id) id,pay.reservation_id,pt.payment_date paymentDate,
              pt.payment_method method,pt.amount,'transaction' source
            FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT pay ON pay.payment_id=pt.payment_id
            UNION ALL
            SELECT CONCAT('L-',pay.payment_id),pay.reservation_id,pay.payment_date,pay.payment_method,pay.amount_paid,'legacy'
            FROM dbo.PAYMENT pay
            WHERE pay.amount_paid>0 AND pay.payment_date IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM dbo.PAYMENT_TRANSACTION existing WHERE existing.payment_id=pay.payment_id)
          )
          SELECT credit.id,i.invoice_number invoiceNumber,r.booking_reference bookingReference,
            CONCAT(c.first_name,' ',c.last_name) customer,CONVERT(varchar(10),credit.paymentDate,23) paymentDate,
            credit.method,credit.amount,credit.source,SUM(credit.amount) OVER () totalCollected
          FROM credits credit
          JOIN dbo.RESERVATION r ON r.reservation_id=credit.reservation_id
          JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
          LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id
          WHERE credit.paymentDate>=CONVERT(date,@dateFrom) AND CONVERT(date,credit.paymentDate)<=CONVERT(date,@dateTo)
            AND (@method='' OR credit.method=@method OR (@method='E-WALLET' AND credit.method='E_WALLET'))
          ORDER BY credit.paymentDate,credit.id;
        `);
      const rows = result.recordset ?? [];
      return {
        filters,
        summary: { totalCollected: numberValue(rows[0]?.['totalCollected']), paymentCount: rows.length },
        items: rows.map(collectionRow),
      };
    },
  };
}

export const adminReportRepository = createAdminReportRepository({ readRequest: async () => new sql.Request(await getDbPool()) });
