import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { CancellationAssessment, InvoiceDetails, InvoiceRefund, RecordedRefund, RefundSettlement } from '../types/invoice.types.js';
import { queueBookingNotification } from '../services/notification.service.js';
import { writeAdminAudit } from './audit.repository.js';
import { readMenuSnapshot } from '../services/package-menu.service.js';
import { bankSnapshotColumns, mapBankSnapshot } from './payment-bank.repository.js';
import { lockedBookingStatus, runBookingStatusTransaction } from './booking-status.repository.js';
import { AppError } from '../utils/app-error.js';

const dateValue = (value: Date | string | undefined) => value ? new Date(value).toISOString() : undefined;

const cancellationAssessmentApply = `OUTER APPLY (
  SELECT TOP (1) JSON_QUERY(CASE WHEN ISJSON(a.new_values)=1 THEN a.new_values END,'$.cancellation') assessment
  FROM dbo.ADMIN_AUDIT_LOG a
  WHERE r.status='CANCELLED' AND a.entity_type='BOOKING' AND a.entity_id=r.reservation_id
    AND a.action='BOOKING_STATUS_CHANGED'
  ORDER BY a.audit_id DESC
) cancellation`;

function readCancellationAssessment(value: unknown): CancellationAssessment | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const data = JSON.parse(value) as Partial<CancellationAssessment> | null;
    if (!data || typeof data.date !== 'string') return undefined;
    if (data.kind === 'ADMIN_REVIEW') return { kind: data.kind, date: data.date };
    if (data.kind !== 'EARLY' && data.kind !== 'LATE') return undefined;
    if (typeof data.forfeitedAmount !== 'number' || typeof data.refundableAmount !== 'number') return undefined;
    return { kind: data.kind, date: data.date, forfeitedAmount: data.forfeitedAmount, refundableAmount: data.refundableAmount };
  } catch { return undefined; }
}

interface RefundRow {
  refund_amount: number;
  refund_date: string | null;
  reference: string | null;
  review_note: string | null;
}

async function readRecordedRefund(request: sql.Request, invoiceId: number, admin: boolean): Promise<RecordedRefund | undefined> {
  const result = await request.replaceInput('invoiceId', sql.Int, invoiceId)
    .query<RefundRow>(`SELECT refund_amount,CONVERT(varchar(10),refund_date,23) refund_date,reference,review_note
      FROM dbo.INVOICE_REFUND WHERE invoice_id=@invoiceId`);
  const row = result.recordset[0];
  if (!row) return undefined;
  const amount = Number(row.refund_amount);
  return {
    status: amount > 0 ? 'REFUNDED' : 'NO_REFUND_DUE',
    amount,
    ...(row.refund_date ? { date: row.refund_date } : {}),
    ...(row.reference ? { reference: row.reference } : {}),
    ...(admin && row.review_note ? { reviewNote: row.review_note } : {}),
  };
}

function refundWithoutSettlement(cancellation: CancellationAssessment | undefined): InvoiceRefund {
  if (cancellation?.kind !== 'EARLY') return { status: 'ADMIN_REVIEW' };
  const amount = cancellation.refundableAmount;
  return { status: amount > 0 ? 'PENDING_REFUND' : 'NO_REFUND_DUE', amount };
}

function refundTableMissing(error: unknown): boolean {
  return error instanceof Error && 'number' in error && error.number === 208 && error.message.includes('dbo.INVOICE_REFUND');
}

async function findRefund(
  pool: sql.ConnectionPool,
  invoiceId: number,
  cancellation: CancellationAssessment | undefined,
  admin: boolean,
): Promise<InvoiceRefund | undefined> {
  try {
    return await readRecordedRefund(pool.request(), invoiceId, admin) ?? refundWithoutSettlement(cancellation);
  } catch (error) {
    if (refundTableMissing(error)) return undefined;
    throw error;
  }
}

export async function saveInvoiceRefund(invoiceId: number, adminId: number, settlement: RefundSettlement): Promise<RecordedRefund> {
  const { amount, date, reference, reviewNote } = settlement;
  try {
    return await runBookingStatusTransaction(async (request) => {
      const invoice = await request.input('invoiceId', sql.Int, invoiceId)
        .query<{ reservation_id: number }>('SELECT reservation_id FROM dbo.INVOICE WHERE invoice_id=@invoiceId');
      const reservationId = invoice.recordset[0]?.reservation_id;
      if (!reservationId) throw new AppError(404, 'Invoice not found.');

      const booking = await lockedBookingStatus(reservationId, request);
      if (booking?.status !== 'CANCELLED') throw new AppError(409, 'Refunds can only be recorded for cancelled reservations.');

      const existing = await readRecordedRefund(request, invoiceId, true);
      if (existing) {
        if (existing.amount === amount && existing.date === date && existing.reference === reference && existing.reviewNote === reviewNote) {
          return existing;
        }
        throw new AppError(409, 'A refund decision is already recorded for this invoice.');
      }

      const source = await request.query<{ amount_paid: number; cancellation_assessment: string | null }>(
        `SELECT COALESCE(pay.amount_paid,0) amount_paid,cancellation.assessment cancellation_assessment
        FROM dbo.RESERVATION r LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
        ${cancellationAssessmentApply}
        WHERE r.reservation_id=@reservationId`);
      const paid = Number(source.recordset[0]?.amount_paid ?? 0);
      if (paid <= 0) throw new AppError(409, 'This invoice has no verified payments to refund.');
      if (amount > paid) throw new AppError(400, 'Refund amount cannot exceed the verified payments.');

      const cancellation = readCancellationAssessment(source.recordset[0]?.cancellation_assessment);
      const assessment = refundWithoutSettlement(cancellation);
      if (assessment.status === 'NO_REFUND_DUE') throw new AppError(409, 'No refund is due for this cancellation.');
      if (cancellation && cancellation.kind !== 'ADMIN_REVIEW' && amount !== cancellation.refundableAmount) {
        throw new AppError(400, 'Enter the assessed refund amount for this cancellation.');
      }
      if (assessment.status === 'ADMIN_REVIEW' && !reviewNote) {
        throw new AppError(400, 'Enter a review note based on the signed agreement.');
      }

      await request.input('refundAmount', sql.Decimal(12, 2), amount)
        .input('refundDate', sql.VarChar(10), date ?? null)
        .input('refundReference', sql.NVarChar(150), reference ?? null)
        .input('refundNote', sql.NVarChar(1000), reviewNote ?? null)
        .input('recordedBy', sql.Int, adminId)
        .query(`INSERT dbo.INVOICE_REFUND(invoice_id,refund_amount,refund_date,reference,review_note,recorded_by)
          VALUES(@invoiceId,@refundAmount,CONVERT(date,@refundDate,23),@refundReference,@refundNote,@recordedBy)`);
      const refund: RecordedRefund = { status: amount > 0 ? 'REFUNDED' : 'NO_REFUND_DUE', ...settlement };
      await writeAdminAudit({
        adminId, action: amount > 0 ? 'REFUND_RECORDED' : 'REFUND_DECISION_RECORDED',
        entityType: 'INVOICE', entityId: invoiceId, newValues: { reservationId, ...refund },
      }, request);
      return refund;
    });
  } catch (error) {
    if (refundTableMissing(error)) throw new AppError(503, 'Refund tracking is temporarily unavailable.');
    if (error instanceof Error && 'number' in error && (error.number === 2601 || error.number === 2627)) {
      throw new AppError(409, 'This refund reference or invoice is already recorded.');
    }
    throw error;
  }
}

interface InvoicePackageLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export function buildInvoicePackageLine(row: Record<string, unknown>): InvoicePackageLine {
  const name = String(row['package_name_snapshot'] ?? row['package_name'] ?? 'Catering package');
  const guests = Number(row['guest_count'] ?? 0);
  const pricingType = String(row['package_pricing_type'] ?? 'PER_HEAD');
  const total = Number(row['package_total'] ?? Number(row['package_unit_price'] ?? 0) * guests);

  if (pricingType === 'BASE_PLUS_EXCESS') {
    const included = Number(row['package_included_guests'] ?? 0);
    const excess = Math.max(guests - included, 0);
    const excessRate = Number(row['package_excess_guest_price'] ?? 0);
    const excessText = excess === 0
      ? 'no excess guests'
      : `${excess} excess ${excess === 1 ? 'guest' : 'guests'} at PHP ${excessRate.toFixed(2)}`;
    return {
      description: `${name} - includes ${included} guests; ${excessText}`,
      quantity: 1,
      unitPrice: total,
      total,
    };
  }

  const unitPrice = Number(row['package_unit_price'] ?? 0);
  return {
    description: `${name} - ${guests} guests at PHP ${unitPrice.toFixed(2)} per guest`,
    quantity: guests,
    unitPrice,
    total,
  };
}

export async function createInvoice(reservationId: number, adminId: number): Promise<number | undefined> {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const invoiceId = await createInvoiceWithRequest(reservationId, adminId, new sql.Request(transaction));
    await transaction.commit();
    return invoiceId;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

/** The caller owns the transaction; existing invoices do not create another notification. */
export async function createInvoiceWithRequest(reservationId: number, adminId: number, request: sql.Request): Promise<number | undefined> {
  const source = await request
    .replaceInput('id', sql.Int, reservationId)
    .query(`SELECT r.reservation_id,r.status,r.guest_count,r.package_name_snapshot,
        r.package_pricing_type,r.package_unit_price,r.package_base_price,r.package_included_guests,
        r.package_excess_guest_price,r.package_total,r.subtotal,r.discount_amount,r.total_amount,
        CONVERT(varchar(10),r.event_date,23) event_date,p.package_name
      FROM dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK)
      LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id
      WHERE r.reservation_id=@id`);
  const row = source.recordset[0];
  if (!row) {
    return undefined;
  }
  if (!['APPROVED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'].includes(String(row.status).toUpperCase())) {
    throw new Error('INVOICE_STATUS');
  }

  const existing = await request
    .replaceInput('id', sql.Int, reservationId)
    .query('SELECT invoice_id FROM dbo.INVOICE WHERE reservation_id=@id');
  if (existing.recordset[0]) {
    return Number(existing.recordset[0].invoice_id);
  }

  const inserted = await request
    .replaceInput('reservationId', sql.Int, reservationId)
    .replaceInput('adminId', sql.Int, adminId)
    .replaceInput('subtotal', sql.Decimal(12,2), row.subtotal)
    .replaceInput('discount', sql.Decimal(12,2), row.discount_amount)
    .replaceInput('total', sql.Decimal(12,2), row.total_amount)
    .replaceInput('dueDate', sql.VarChar(10), row.event_date)
    .query(`DECLARE @sequence bigint=NEXT VALUE FOR dbo.INVOICE_NUMBER_SEQUENCE;
      DECLARE @number nvarchar(30)=CONCAT('INV-',YEAR(SYSDATETIME()),'-',RIGHT(CONCAT('000000',@sequence),6));
      INSERT dbo.INVOICE(reservation_id,invoice_number,due_at,status,subtotal,discount_amount,total_amount,issued_by)
      OUTPUT INSERTED.invoice_id
      VALUES(@reservationId,@number,CAST(@dueDate AS date),'ISSUED',@subtotal,@discount,@total,@adminId)`);
  const invoiceId = Number(inserted.recordset[0].invoice_id);
  const packageLine = buildInvoicePackageLine(row);
  await request
    .replaceInput('invoiceId', sql.Int, invoiceId)
    .replaceInput('description', sql.NVarChar(250), packageLine.description)
    .replaceInput('quantity', sql.Int, packageLine.quantity)
    .replaceInput('unitPrice', sql.Decimal(12,2), packageLine.unitPrice)
    .replaceInput('total', sql.Decimal(12,2), packageLine.total)
    .query(`INSERT dbo.INVOICE_ITEM(invoice_id,description,quantity,unit_price,line_total,item_type)
      VALUES(@invoiceId,@description,@quantity,@unitPrice,@total,'PACKAGE')`);
  await request
    .replaceInput('invoiceId', sql.Int, invoiceId)
    .replaceInput('reservationId', sql.Int, reservationId)
    .query(`INSERT dbo.INVOICE_ITEM(invoice_id,description,quantity,unit_price,line_total,item_type)
      SELECT @invoiceId,a.add_on_name,ra.quantity,ra.unit_price,ra.unit_price*ra.quantity,'ADD_ON'
      FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.ADD_ON a ON a.add_on_id=ra.add_on_id
      WHERE ra.reservation_id=@reservationId`);
  await writeAdminAudit({ adminId, action: 'INVOICE_ISSUED', entityType: 'INVOICE', entityId: invoiceId, newValues: { bookingId: reservationId } }, request);
  await queueBookingNotification(reservationId, 'INVOICE_ISSUED', request, {}, 'INVOICE', String(invoiceId));
  return invoiceId;
}

export async function findInvoice(invoiceId: number, customerId?: number): Promise<InvoiceDetails | undefined> {
  const pool = await getDbPool();
  const request = pool.request().input('invoiceId', sql.Int, invoiceId).input('customerId', sql.Int, customerId ?? null);
  const main = await request.query(`SELECT i.invoice_id,i.invoice_number,i.issued_at,i.due_at,i.status,i.subtotal,
      i.discount_amount,i.total_amount,r.reservation_id,r.status reservation_status,r.booking_reference,r.event_date,r.event_time,
      r.venue_address,r.guest_count,r.menu_selection_json,e.event_type,c.customer_id,CONCAT(c.first_name,' ',c.last_name) customer_name,
      c.email,c.contact_number,issuer.full_name issuer_name,COALESCE(pay.amount_paid,0) amount_paid,
      cancellation.assessment cancellation_assessment
    FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
    JOIN dbo.EVENT e ON e.event_id=r.event_id JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
    LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
    LEFT JOIN dbo.ADMIN issuer ON issuer.admin_id=i.issued_by
    ${cancellationAssessmentApply}
    WHERE i.invoice_id=@invoiceId AND (@customerId IS NULL OR c.customer_id=@customerId)`);
  const row = main.recordset[0];
  if (!row) return undefined;
  const items = await pool.request().input('invoiceId', sql.Int, invoiceId)
    .query('SELECT description,quantity,unit_price,line_total FROM dbo.INVOICE_ITEM WHERE invoice_id=@invoiceId ORDER BY invoice_item_id');
  const payments = await pool.request().input('reservationId', sql.Int, row.reservation_id)
    .query(`SELECT pt.payment_transaction_id id,pt.payment_date,pt.transaction_ref,pt.payment_method,pt.amount,${bankSnapshotColumns('pt')},
        'RECORDED' status FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id
      WHERE p.reservation_id=@reservationId ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC`);
  const paid = Number(row.amount_paid);
  const total = Number(row.total_amount);
  const cancelled = row.reservation_status === 'CANCELLED' || row.status === 'CANCELLED';
  const cancellation = cancelled ? readCancellationAssessment(row.cancellation_assessment) : undefined;
  const refund = cancelled && paid > 0 ? await findRefund(pool, invoiceId, cancellation, customerId === undefined) : undefined;
  const settledPaymentStatus = paid >= total ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : row.status;
  return {
    invoiceId: Number(row.invoice_id), invoiceNumber: row.invoice_number, issueDate: dateValue(row.issued_at)!,
    dueDate: cancelled ? undefined : dateValue(row.due_at), status: cancelled ? 'CANCELLED' : settledPaymentStatus,
    customer: { id: Number(row.customer_id), name: row.customer_name, email: row.email, phone: row.contact_number },
    issuer: { name: row.issuer_name ?? '' },
    booking: {
      id: Number(row.reservation_id), status: row.reservation_status, reference: row.booking_reference, eventType: row.event_type,
      eventDate: new Date(row.event_date).toISOString().slice(0,10),
      eventTime: new Date(row.event_time).toISOString().slice(11,16), venue: row.venue_address, guestCount: row.guest_count, menuSelection: readMenuSnapshot(row.menu_selection_json),
    },
    items: items.recordset.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: Number(item.unit_price), amount: Number(item.line_total) })),
    subtotal: Number(row.subtotal), discount: Number(row.discount_amount), totalAmount: total, amountPaid: paid,
    remainingBalance: cancelled ? 0 : Math.max(total - paid, 0),
    cancellation, refund,
    payments: payments.recordset.map((payment) => ({
      id: Number(payment.id), date: dateValue(payment.payment_date)!, reference: payment.transaction_ref ?? undefined,
      method: payment.payment_method, amount: Number(payment.amount), status: payment.status, ...mapBankSnapshot(payment),
    })),
  };
}

export async function findInvoiceIdByBooking(reservationId: number, customerId?: number): Promise<number | undefined> {
  const pool = await getDbPool();
  const result = await pool.request().input('reservationId', sql.Int, reservationId).input('customerId', sql.Int, customerId ?? null)
    .query(`SELECT i.invoice_id FROM dbo.INVOICE i JOIN dbo.RESERVATION r ON r.reservation_id=i.reservation_id
      WHERE i.reservation_id=@reservationId AND(@customerId IS NULL OR r.customer_id=@customerId)`);
  return result.recordset[0] ? Number(result.recordset[0].invoice_id) : undefined;
}

export async function syncInvoiceStatus(reservationId: number) {
  const pool = await getDbPool();
  await pool.request().input('reservationId', sql.Int, reservationId)
    .query(`UPDATE i SET status=CASE WHEN p.amount_paid>=i.total_amount THEN 'PAID'
        WHEN p.amount_paid>0 THEN 'PARTIALLY_PAID' ELSE 'ISSUED' END
      FROM dbo.INVOICE i JOIN dbo.PAYMENT p ON p.reservation_id=i.reservation_id
      WHERE i.reservation_id=@reservationId AND i.status<>'CANCELLED'`);
}
