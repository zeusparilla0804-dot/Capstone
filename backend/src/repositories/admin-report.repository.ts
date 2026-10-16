import sql from 'mssql';

import { getDbPool } from '../config/database.js';
import type { AdminPaymentReport, AdminReservationReport, PaymentReportItem, PaymentReportQuery, ReservationReportItem, ReservationReportQuery } from '../types/admin-report.types.js';

interface Dependencies { readRequest(): Promise<sql.Request> }

const reservationColumns = `r.booking_reference reference,CONCAT(c.first_name,' ',c.last_name) customer,
  CONVERT(varchar(10),r.event_date,23) eventDate,CONVERT(varchar(5),r.event_time,108) eventTime,
  e.event_type eventType,r.guest_count guestCount,r.venue_address venue,COALESCE(p.package_name,'Custom event') packageName,r.status`;

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
            COALESCE(SUM(CASE WHEN i.total_amount>pay.amount_paid THEN i.total_amount-pay.amount_paid ELSE 0 END),0) outstandingBalance
          FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
          JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
          OUTER APPLY (SELECT TOP (1) pt.payment_method,pt.payment_date FROM dbo.PAYMENT_TRANSACTION pt
            WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC) latest
          WHERE i.issued_at>=CONVERT(date,@dateFrom) AND CONVERT(date,i.issued_at)<=CONVERT(date,@dateTo)
            AND (@status='' OR pay.status=@status) AND (@method='' OR COALESCE(latest.payment_method,pay.payment_method)=@method);

          SELECT i.invoice_number invoiceNumber,r.booking_reference bookingReference,CONCAT(c.first_name,' ',c.last_name) customer,
            CONVERT(varchar(10),i.issued_at,23) issuedDate,CONVERT(varchar(10),latest.payment_date,23) latestPaymentDate,
            COALESCE(latest.payment_method,pay.payment_method,'') method,i.total_amount amountDue,pay.amount_paid amountPaid,
            CASE WHEN i.total_amount>pay.amount_paid THEN i.total_amount-pay.amount_paid ELSE 0 END outstandingBalance,pay.status
          FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
          JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
          OUTER APPLY (SELECT TOP (1) pt.payment_method,pt.payment_date FROM dbo.PAYMENT_TRANSACTION pt
            WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC) latest
          WHERE i.issued_at>=CONVERT(date,@dateFrom) AND CONVERT(date,i.issued_at)<=CONVERT(date,@dateTo)
            AND (@status='' OR pay.status=@status) AND (@method='' OR COALESCE(latest.payment_method,pay.payment_method)=@method)
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
  };
}

export const adminReportRepository = createAdminReportRepository({ readRequest: async () => new sql.Request(await getDbPool()) });
