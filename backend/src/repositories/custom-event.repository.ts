import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { bookingAvailabilityService } from '../services/booking-availability.service.js';
import { queueCustomEventNotification, queueCustomEventReceipt } from '../services/notification.service.js';
import { writeAdminAudit } from './audit.repository.js';
import { transitionBooking } from '../services/booking-status.service.js';
import {
  assertQuoteAcceptable,
  assertRequestTransition,
  assertQuoteTransition,
  calculateQuoteTotals,
} from '../services/custom-quote-domain.service.js';
import { insertBookingStatusHistory } from './booking-status.repository.js';
import type {
  AcceptedCustomQuoteResult,
  AdminCustomEventQuery,
  AdminCustomEventQueueItem,
  CreateCustomEventRequestDto,
  CustomEventRequestDetail,
  CustomEventRequestStatus,
  CustomEventSubmission,
  CustomQuote,
  CustomQuoteItem,
  CustomQuoteStatus,
  SendCustomQuoteInput,
} from '../types/custom-event.types.js';
import type { PageResult } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';

function dateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function timeOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(11, 16) : String(value).slice(0, 5);
}

function dateTime(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function parseRequestedServices(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function quoteItem(row: Record<string, unknown>): CustomQuoteItem {
  return {
    id: Number(row['quote_item_id']),
    quoteId: Number(row['quote_id']),
    sortOrder: Number(row['sort_order']),
    description: String(row['description']),
    quantity: Number(row['quantity']),
    unitPrice: Number(row['unit_price']),
    lineTotal: Number(row['line_total']),
  };
}

function quote(row: Record<string, unknown>, items: CustomQuoteItem[]): CustomQuote {
  return {
    id: Number(row['quote_id']),
    requestId: Number(row['request_id']),
    version: Number(row['version']),
    subtotal: Number(row['subtotal']),
    discount: Number(row['discount_amount']),
    total: Number(row['total_amount']),
    requiredDownPayment: Number(row['required_down_payment']),
    validUntil: dateOnly(row['valid_until'] as Date | string),
    terms: row['terms'] === null ? null : String(row['terms']),
    status: String(row['status']) as CustomQuoteStatus,
    sentBy: row['sent_by'] === null ? null : Number(row['sent_by']),
    sentAt: dateTime(row['sent_at'] as Date | string | null),
    acceptedAt: dateTime(row['accepted_at'] as Date | string | null),
    declinedAt: dateTime(row['declined_at'] as Date | string | null),
    createdAt: dateTime(row['created_at'] as Date | string)!,
    items,
  };
}

async function hydrateDetail(
  pool: sql.ConnectionPool,
  row: Record<string, unknown>,
  requestId: number,
): Promise<CustomEventRequestDetail> {
  const quoteRows = await new sql.Request(pool)
    .input('requestId', sql.Int, requestId)
    .query<Record<string, unknown>>('SELECT * FROM dbo.CUSTOM_QUOTE WHERE request_id=@requestId ORDER BY version DESC');
  const itemRows = await new sql.Request(pool)
    .input('requestId', sql.Int, requestId)
    .query<Record<string, unknown>>(`SELECT qi.* FROM dbo.CUSTOM_QUOTE_ITEM qi
      JOIN dbo.CUSTOM_QUOTE q ON q.quote_id=qi.quote_id
      WHERE q.request_id=@requestId ORDER BY q.version DESC,qi.sort_order`);
  const itemsByQuote = new Map<number, CustomQuoteItem[]>();
  for (const itemRow of itemRows.recordset) {
    const item = quoteItem(itemRow);
    const items = itemsByQuote.get(item.quoteId) ?? [];
    items.push(item);
    itemsByQuote.set(item.quoteId, items);
  }
  const quoteHistory = quoteRows.recordset.map(quoteRow => {
    const quoteId = Number(quoteRow['quote_id']);
    return quote(quoteRow, itemsByQuote.get(quoteId) ?? []);
  });
  const currentQuote = quoteHistory.find(item => item.status === 'SENT' || item.status === 'ACCEPTED') ?? null;
  return {
    id: Number(row['request_id']),
    reservationId: Number(row['reservation_id']),
    sourcePackageId: row['source_package_id'] === null ? null : Number(row['source_package_id']),
    targetBudget: row['target_budget'] === null ? null : Number(row['target_budget']),
    menuPreferences: row['menu_preferences'] === null ? null : String(row['menu_preferences']),
    dietaryNotes: row['dietary_notes'] === null ? null : String(row['dietary_notes']),
    setupPreferences: row['setup_preferences'] === null ? null : String(row['setup_preferences']),
    requestedServices: parseRequestedServices(row['requested_services']),
    specialRequests: row['special_requests'] === null ? null : String(row['special_requests']),
    status: String(row['status']) as CustomEventRequestStatus,
    clarificationReason: row['clarification_reason'] === null ? null : String(row['clarification_reason']),
    rejectionReason: row['rejection_reason'] === null ? null : String(row['rejection_reason']),
    createdAt: dateTime(row['created_at'] as Date | string)!,
    updatedAt: dateTime(row['updated_at'] as Date | string)!,
    currentQuote,
    quoteHistory,
    reference: String(row['booking_reference']),
    eventType: String(row['event_type']),
    eventDate: dateOnly(row['event_date'] as Date | string),
    eventTime: timeOnly(row['event_time'] as Date | string),
    venue: String(row['venue_address']),
    guestCount: Number(row['guest_count']),
    sourcePackageName: row['source_package_name'] === null ? null : String(row['source_package_name']),
  };
}

export async function submitCustomEventRequest(
  customerId: number,
  dto: CreateCustomEventRequestDto,
): Promise<CustomEventSubmission> {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (dto.sourcePackageId !== undefined) {
      const source = await new sql.Request(transaction)
        .input('sourcePackageId', sql.Int, dto.sourcePackageId)
        .query('SELECT package_id FROM dbo.PACKAGE WHERE package_id=@sourcePackageId AND is_active=1');
      if (!source.recordset[0]) throw new AppError(400, 'Selected source package is unavailable.');
    }

    await bookingAvailabilityService.assertCanAccept(
      dto.eventDate,
      dto.guestCount,
      new sql.Request(transaction),
    );
    const event = await new sql.Request(transaction)
      .input('eventType', sql.NVarChar(100), dto.eventType)
      .query('SELECT event_id FROM dbo.EVENT WHERE LOWER(event_type)=LOWER(@eventType)');
    const eventId = event.recordset[0]?.event_id;
    if (!eventId) throw new AppError(400, 'Event type is unavailable.');

    const reference = `CQ-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const reservation = await new sql.Request(transaction)
      .input('customerId', sql.Int, customerId)
      .input('eventId', sql.Int, eventId)
      .input('reference', sql.NVarChar(30), reference)
      .input('eventDate', sql.Date, new Date(`${dto.eventDate}T00:00:00.000Z`))
      .input('eventTime', sql.Time, new Date(`1970-01-01T${dto.eventTime}:00.000Z`))
      .input('guestCount', sql.Int, dto.guestCount)
      .input('venue', sql.NVarChar(500), dto.venue)
      .input('specialRequest', sql.NVarChar(2000), dto.specialRequest ?? null)
      .query(`INSERT dbo.RESERVATION(
          customer_id,event_id,booking_reference,event_date,event_time,guest_count,
          venue_address,special_request,status
        ) OUTPUT INSERTED.reservation_id VALUES(
          @customerId,@eventId,@reference,@eventDate,@eventTime,@guestCount,
          @venue,@specialRequest,'PENDING'
        )`);
    const reservationId = Number(reservation.recordset[0]?.reservation_id);

    const customRequest = await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId)
      .input('sourcePackageId', sql.Int, dto.sourcePackageId ?? null)
      .input('targetBudget', sql.Decimal(12, 2), dto.targetBudget ?? null)
      .input('menuPreferences', sql.NVarChar(2000), dto.menuPreferences ?? null)
      .input('dietaryNotes', sql.NVarChar(2000), dto.dietaryNotes ?? null)
      .input('setupPreferences', sql.NVarChar(2000), dto.setupPreferences ?? null)
      .input('requestedServices', sql.NVarChar(2000), JSON.stringify(dto.requestedServices))
      .input('specialRequests', sql.NVarChar(2000), dto.specialRequest ?? null)
      .query(`INSERT dbo.CUSTOM_EVENT_REQUEST(
          reservation_id,source_package_id,target_budget,menu_preferences,dietary_notes,
          setup_preferences,requested_services,special_requests,status
        ) OUTPUT INSERTED.request_id VALUES(
          @reservationId,@sourcePackageId,@targetBudget,@menuPreferences,@dietaryNotes,
          @setupPreferences,@requestedServices,@specialRequests,'AWAITING_QUOTE'
        )`);
    const id = Number(customRequest.recordset[0]?.request_id);

    await queueCustomEventReceipt(reservationId, id, new sql.Request(transaction));
    await transaction.commit();
    return { id, reservationId, reference, status: 'AWAITING_QUOTE' };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

export async function findOwnedCustomEventRequest(
  customerId: number,
  requestId: number,
): Promise<CustomEventRequestDetail | undefined> {
  const pool = await getDbPool();
  const base = await new sql.Request(pool)
    .input('customerId', sql.Int, customerId)
    .input('requestId', sql.Int, requestId)
    .query<Record<string, unknown>>(`SELECT q.*,r.booking_reference,r.event_date,r.event_time,
        r.guest_count,r.venue_address,e.event_type,p.package_name source_package_name
      FROM dbo.CUSTOM_EVENT_REQUEST q
      JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
      JOIN dbo.EVENT e ON e.event_id=r.event_id
      LEFT JOIN dbo.PACKAGE p ON p.package_id=q.source_package_id
      WHERE q.request_id=@requestId AND r.customer_id=@customerId`);
  const row = base.recordset[0];
  if (!row) return undefined;
  return hydrateDetail(pool, row, requestId);
}

export async function listAdminCustomEventRequests(
  input: AdminCustomEventQuery,
): Promise<PageResult<AdminCustomEventQueueItem>> {
  const pool = await getDbPool();
  const where = `WHERE (@status='' OR q.status=@status)
    AND (@search='' OR r.booking_reference LIKE '%'+@search+'%' OR c.first_name LIKE '%'+@search+'%'
      OR c.last_name LIKE '%'+@search+'%' OR c.email LIKE '%'+@search+'%')`;
  const bind = (request: sql.Request) => request
    .input('status', sql.VarChar(30), input.status)
    .input('search', sql.NVarChar(100), input.search);
  const totalResult = await bind(new sql.Request(pool)).query<{ total: number }>(`SELECT COUNT_BIG(*) total
    FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
    JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id ${where}`);
  const offset = (input.page - 1) * input.pageSize;
  const rows = await bind(new sql.Request(pool))
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, input.pageSize)
    .query<Record<string, unknown>>(`SELECT q.request_id,q.reservation_id,q.target_budget,q.status,q.created_at,
        r.booking_reference,r.event_date,r.guest_count,e.event_type,p.package_name source_package_name,
        CONCAT(c.first_name,' ',c.last_name) customer_name,
        sent.total_amount current_quote_total
      FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
      JOIN dbo.EVENT e ON e.event_id=r.event_id JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
      LEFT JOIN dbo.PACKAGE p ON p.package_id=q.source_package_id
      OUTER APPLY(SELECT TOP 1 total_amount FROM dbo.CUSTOM_QUOTE cq
        WHERE cq.request_id=q.request_id AND cq.status IN('SENT','ACCEPTED') ORDER BY version DESC) sent
      ${where} ORDER BY q.created_at ASC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
  const totalItems = Number(totalResult.recordset[0]?.total ?? 0);
  return {
    items: rows.recordset.map(row => ({
      id: Number(row['request_id']), reservationId: Number(row['reservation_id']),
      reference: String(row['booking_reference']), customerName: String(row['customer_name']),
      eventType: String(row['event_type']), eventDate: dateOnly(row['event_date'] as Date | string),
      guestCount: Number(row['guest_count']),
      sourcePackageName: row['source_package_name'] === null ? null : String(row['source_package_name']),
      targetBudget: row['target_budget'] === null ? null : Number(row['target_budget']),
      status: String(row['status']) as CustomEventRequestStatus,
      currentQuoteTotal: row['current_quote_total'] === null ? null : Number(row['current_quote_total']),
      createdAt: dateTime(row['created_at'] as Date | string)!,
    })),
    page: input.page, pageSize: input.pageSize, totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / input.pageSize),
  };
}

export async function findAdminCustomEventRequest(requestId: number): Promise<CustomEventRequestDetail | undefined> {
  const pool = await getDbPool();
  const base = await new sql.Request(pool).input('requestId', sql.Int, requestId)
    .query<Record<string, unknown>>(`SELECT q.*,r.booking_reference,r.event_date,r.event_time,
        r.guest_count,r.venue_address,e.event_type,p.package_name source_package_name
      FROM dbo.CUSTOM_EVENT_REQUEST q JOIN dbo.RESERVATION r ON r.reservation_id=q.reservation_id
      JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=q.source_package_id
      WHERE q.request_id=@requestId`);
  return base.recordset[0] ? hydrateDetail(pool, base.recordset[0], requestId) : undefined;
}

export async function createAndSendCustomQuote(
  adminId: number,
  requestId: number,
  input: SendCustomQuoteInput,
): Promise<CustomQuote> {
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const locked = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query<Record<string, unknown>>(`SELECT q.status,q.reservation_id,COALESCE(MAX(cq.version),0) current_version
        FROM dbo.CUSTOM_EVENT_REQUEST q WITH(UPDLOCK,HOLDLOCK)
        LEFT JOIN dbo.CUSTOM_QUOTE cq WITH(UPDLOCK,HOLDLOCK) ON cq.request_id=q.request_id
        WHERE q.request_id=@requestId GROUP BY q.status,q.reservation_id`);
    const current = locked.recordset[0];
    if (!current) throw new AppError(404, 'Custom event request not found.');
    const previousStatus = String(current['status']) as CustomEventRequestStatus;
    assertRequestTransition(previousStatus, 'QUOTE_SENT');
    const sentQuotes = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query<Record<string, unknown>>(`SELECT quote_id,status FROM dbo.CUSTOM_QUOTE WITH(UPDLOCK,HOLDLOCK)
        WHERE request_id=@requestId AND status='SENT'`);
    for (const sent of sentQuotes.recordset) assertQuoteTransition(String(sent['status']) as CustomQuoteStatus, 'SUPERSEDED');
    await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query(`UPDATE dbo.CUSTOM_QUOTE SET status='SUPERSEDED' WHERE request_id=@requestId AND status='SENT'`);
    const version = Number(current['current_version']) + 1;
    const inserted = await new sql.Request(transaction)
      .input('requestId', sql.Int, requestId).input('version', sql.Int, version)
      .input('subtotal', sql.Decimal(12, 2), input.subtotal).input('total', sql.Decimal(12, 2), input.total)
      .input('downPayment', sql.Decimal(12, 2), input.requiredDownPayment)
      .input('validUntil', sql.Date, new Date(`${input.validUntil}T00:00:00.000Z`))
      .input('terms', sql.NVarChar(4000), input.terms).input('adminId', sql.Int, adminId)
      .query<Record<string, unknown>>(`INSERT dbo.CUSTOM_QUOTE(request_id,version,subtotal,discount_amount,
        total_amount,required_down_payment,valid_until,terms,status,sent_by,sent_at)
        OUTPUT INSERTED.quote_id,INSERTED.created_at,INSERTED.sent_at
        VALUES(@requestId,@version,@subtotal,0,@total,@downPayment,@validUntil,@terms,'SENT',@adminId,sysutcdatetime())`);
    const quoteId = Number(inserted.recordset[0]?.['quote_id']);
    const items: CustomQuoteItem[] = [];
    for (const [index, item] of input.items.entries()) {
      const result = await new sql.Request(transaction).input('quoteId', sql.Int, quoteId)
        .input('sortOrder', sql.Int, index + 1).input('description', sql.NVarChar(250), item.description)
        .input('quantity', sql.Decimal(12, 2), item.quantity).input('unitPrice', sql.Decimal(12, 2), item.unitPrice)
        .input('lineTotal', sql.Decimal(12, 2), item.lineTotal)
        .query<Record<string, unknown>>(`INSERT dbo.CUSTOM_QUOTE_ITEM(quote_id,sort_order,description,quantity,unit_price,line_total)
          OUTPUT INSERTED.quote_item_id VALUES(@quoteId,@sortOrder,@description,@quantity,@unitPrice,@lineTotal)`);
      items.push({ id: Number(result.recordset[0]?.['quote_item_id']), quoteId, sortOrder: index + 1, ...item });
    }
    await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query(`UPDATE dbo.CUSTOM_EVENT_REQUEST SET status='QUOTE_SENT',clarification_reason=NULL,updated_at=sysutcdatetime()
        WHERE request_id=@requestId`);
    await writeAdminAudit({ adminId, action: 'CUSTOM_QUOTE_SENT', entityType: 'CUSTOM_EVENT_REQUEST', entityId: requestId,
      oldValues: { status: previousStatus }, newValues: { status: 'QUOTE_SENT', quoteId, version, total: input.total } }, new sql.Request(transaction));
    await queueCustomEventNotification(Number(current['reservation_id']), requestId, 'CUSTOM_QUOTE_SENT',
      new sql.Request(transaction), { quoteTotal: input.total.toFixed(2), validUntil: input.validUntil });
    await transaction.commit();
    return { id: quoteId, requestId, version, subtotal: input.subtotal, discount: 0, total: input.total,
      requiredDownPayment: input.requiredDownPayment, validUntil: input.validUntil, terms: input.terms, status: 'SENT',
      sentBy: adminId, sentAt: dateTime(inserted.recordset[0]?.['sent_at'] as Date | string)!, acceptedAt: null,
      declinedAt: null, createdAt: dateTime(inserted.recordset[0]?.['created_at'] as Date | string)!, items };
  } catch (error) { try { await transaction.rollback(); } catch { /* Preserve original failure. */ } throw error; }
}

async function setRequestDisposition(
  adminId: number, requestId: number, nextStatus: 'NEEDS_CLARIFICATION' | 'REJECTED', reason: string,
): Promise<void> {
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const result = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query<Record<string, unknown>>(`SELECT status,reservation_id FROM dbo.CUSTOM_EVENT_REQUEST WITH(UPDLOCK,HOLDLOCK)
        WHERE request_id=@requestId`);
    const current = result.recordset[0]; if (!current) throw new AppError(404, 'Custom event request not found.');
    const previousStatus = String(current['status']) as CustomEventRequestStatus;
    assertRequestTransition(previousStatus, nextStatus);
    await new sql.Request(transaction).input('requestId', sql.Int, requestId).input('reason', sql.NVarChar(1000), reason)
      .input('nextStatus', sql.VarChar(30), nextStatus)
      .query(`UPDATE dbo.CUSTOM_EVENT_REQUEST SET status=@nextStatus,
        clarification_reason=CASE WHEN @nextStatus='NEEDS_CLARIFICATION' THEN @reason ELSE clarification_reason END,
        rejection_reason=CASE WHEN @nextStatus='REJECTED' THEN @reason ELSE rejection_reason END,
        updated_at=sysutcdatetime() WHERE request_id=@requestId`);
    if (nextStatus === 'REJECTED') await transitionBooking({ reservationId: Number(current['reservation_id']),
      nextStatus: 'REJECTED', expectedStatus: 'PENDING', actor: { type: 'ADMIN', id: adminId }, reason,
      request: new sql.Request(transaction) });
    else await queueCustomEventNotification(Number(current['reservation_id']), requestId, 'CUSTOM_CLARIFICATION_REQUESTED',
      new sql.Request(transaction), { reason });
    await writeAdminAudit({ adminId, action: nextStatus === 'REJECTED' ? 'CUSTOM_REQUEST_REJECTED' : 'CUSTOM_CLARIFICATION_REQUESTED',
      entityType: 'CUSTOM_EVENT_REQUEST', entityId: requestId, oldValues: { status: previousStatus },
      newValues: { status: nextStatus, reason } }, new sql.Request(transaction));
    await transaction.commit();
  } catch (error) { try { await transaction.rollback(); } catch { /* Preserve original failure. */ } throw error; }
}

export function requestCustomEventClarification(adminId: number, requestId: number, reason: string): Promise<void> {
  return setRequestDisposition(adminId, requestId, 'NEEDS_CLARIFICATION', reason);
}

export function rejectCustomEventRequest(adminId: number, requestId: number, reason: string): Promise<void> {
  return setRequestDisposition(adminId, requestId, 'REJECTED', reason);
}

export async function acceptCustomQuote(
  customerId: number,
  requestId: number,
  quoteId: number,
): Promise<AcceptedCustomQuoteResult> {
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input('customerId', sql.Int, customerId).input('requestId', sql.Int, requestId).input('quoteId', sql.Int, quoteId)
      .query<Record<string, unknown>>(`/* custom quote acceptance lock */
        SELECT q.status request_status,q.reservation_id,r.status reservation_status,r.accepted_quote_id,
          CONVERT(varchar(10),r.event_date,23) event_date,r.guest_count,cq.quote_id,cq.status quote_status,
          cq.version,cq.subtotal,cq.discount_amount,cq.total_amount,cq.required_down_payment,
          CONVERT(varchar(10),cq.valid_until,23) valid_until,cq.sent_by
        FROM dbo.CUSTOM_EVENT_REQUEST q WITH(UPDLOCK,HOLDLOCK)
        JOIN dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK) ON r.reservation_id=q.reservation_id
        LEFT JOIN dbo.CUSTOM_QUOTE cq WITH(UPDLOCK,HOLDLOCK) ON cq.request_id=q.request_id AND cq.quote_id=@quoteId
        WHERE q.request_id=@requestId AND r.customer_id=@customerId`);
    const row = locked.recordset[0];
    if (!row || row['quote_id'] === null || row['quote_id'] === undefined) {
      throw new AppError(404, 'Custom event request not found.');
    }
    const requestStatus = String(row['request_status']) as CustomEventRequestStatus;
    const quoteStatus = String(row['quote_status']) as CustomQuoteStatus;
    assertRequestTransition(requestStatus, 'ACCEPTED');
    assertQuoteTransition(quoteStatus, 'ACCEPTED');
    assertQuoteAcceptable({ status: quoteStatus, validUntil: String(row['valid_until']) });
    if (String(row['reservation_status']) !== 'PENDING' || row['accepted_quote_id'] !== null) {
      throw new AppError(409, 'This quotation has already been processed.', 'CUSTOM_QUOTE_STATE_CONFLICT');
    }
    const current = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query<Record<string, unknown>>(`/* current sent quote */ SELECT TOP 1 quote_id FROM dbo.CUSTOM_QUOTE WITH(UPDLOCK,HOLDLOCK)
        WHERE request_id=@requestId AND status='SENT' ORDER BY version DESC`);
    if (Number(current.recordset[0]?.['quote_id']) !== quoteId) {
      throw new AppError(409, 'This quotation is no longer the current version.', 'CUSTOM_QUOTE_NOT_CURRENT');
    }
    const lineRows = await new sql.Request(transaction).input('quoteId', sql.Int, quoteId)
      .query<Record<string, unknown>>(`SELECT description,quantity,unit_price,line_total FROM dbo.CUSTOM_QUOTE_ITEM
        WHERE quote_id=@quoteId ORDER BY sort_order`);
    const lines = lineRows.recordset.map(item => ({
      description: String(item['description']), quantity: Number(item['quantity']), unitPrice: Number(item['unit_price']),
    }));
    const totals = calculateQuoteTotals(lines, Number(row['required_down_payment']));
    const persistedLineTotals = lineRows.recordset.map(item => Number(item['line_total']));
    if (totals.subtotal !== Number(row['subtotal']) || totals.total !== Number(row['total_amount'])
      || totals.lineTotals.some((value, index) => value !== persistedLineTotals[index])) {
      throw new AppError(409, 'Quotation totals could not be verified.', 'CUSTOM_QUOTE_TOTAL_MISMATCH');
    }
    const issuedBy = Number(row['sent_by']);
    if (!Number.isSafeInteger(issuedBy) || issuedBy < 1) {
      throw new AppError(409, 'Quotation issuer could not be verified.', 'CUSTOM_QUOTE_ISSUER_INVALID');
    }
    const reservationId = Number(row['reservation_id']);
    await bookingAvailabilityService.assertCanAccept(
      String(row['event_date']), Number(row['guest_count']), new sql.Request(transaction), reservationId,
    );
    const reservation = await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId).input('quoteId', sql.Int, quoteId)
      .input('subtotal', sql.Decimal(12, 2), Number(row['subtotal']))
      .input('discount', sql.Decimal(12, 2), Number(row['discount_amount']))
      .input('total', sql.Decimal(12, 2), Number(row['total_amount']))
      .query(`UPDATE dbo.RESERVATION SET accepted_quote_id=@quoteId,subtotal=@subtotal,
        discount_amount=@discount,total_amount=@total,status='AWAITING_PAYMENT'
        WHERE reservation_id=@reservationId AND status='PENDING' AND accepted_quote_id IS NULL`);
    if ((reservation.rowsAffected[0] ?? 0) !== 1) {
      throw new AppError(409, 'This quotation has already been processed.', 'CUSTOM_QUOTE_STATE_CONFLICT');
    }
    const payment = await new sql.Request(transaction).input('reservationId', sql.Int, reservationId)
      .input('total', sql.Decimal(12, 2), Number(row['total_amount']))
      .query<Record<string, unknown>>(`INSERT dbo.PAYMENT(reservation_id,amount_due,amount_paid,status)
        OUTPUT INSERTED.payment_id VALUES(@reservationId,@total,0,'PENDING')`);
    const paymentId = Number(payment.recordset[0]?.['payment_id']);
    const invoice = await new sql.Request(transaction).input('reservationId', sql.Int, reservationId)
      .input('adminId', sql.Int, issuedBy)
      .input('subtotal', sql.Decimal(12, 2), Number(row['subtotal']))
      .input('discount', sql.Decimal(12, 2), Number(row['discount_amount']))
      .input('total', sql.Decimal(12, 2), Number(row['total_amount']))
      .query<Record<string, unknown>>(`DECLARE @sequence bigint=NEXT VALUE FOR dbo.INVOICE_NUMBER_SEQUENCE;
        DECLARE @number nvarchar(30)=CONCAT('INV-',YEAR(SYSDATETIME()),'-',RIGHT(CONCAT('000000',@sequence),6));
        INSERT dbo.INVOICE(reservation_id,invoice_number,due_at,status,subtotal,discount_amount,total_amount,issued_by)
        OUTPUT INSERTED.invoice_id VALUES(@reservationId,@number,DATEADD(day,7,SYSDATETIME()),'ISSUED',
          @subtotal,@discount,@total,@adminId)`);
    const invoiceId = Number(invoice.recordset[0]?.['invoice_id']);
    for (const [index, item] of lines.entries()) {
      await new sql.Request(transaction).input('invoiceId', sql.Int, invoiceId)
        .input('description', sql.NVarChar(250), item.description)
        .input('quantity', sql.Decimal(12, 2), item.quantity)
        .input('unitPrice', sql.Decimal(12, 2), item.unitPrice)
        .input('lineTotal', sql.Decimal(12, 2), totals.lineTotals[index]!)
        .query(`INSERT dbo.INVOICE_ITEM(invoice_id,description,quantity,unit_price,line_total,item_type)
          VALUES(@invoiceId,@description,@quantity,@unitPrice,@lineTotal,'CHARGE')`);
    }
    const quoteUpdate = await new sql.Request(transaction).input('quoteId', sql.Int, quoteId)
      .query(`UPDATE dbo.CUSTOM_QUOTE SET status='ACCEPTED',accepted_at=sysutcdatetime()
        WHERE quote_id=@quoteId AND status='SENT'`);
    const requestUpdate = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query(`UPDATE dbo.CUSTOM_EVENT_REQUEST SET status='ACCEPTED',updated_at=sysutcdatetime()
        WHERE request_id=@requestId AND status='QUOTE_SENT'`);
    if ((quoteUpdate.rowsAffected[0] ?? 0) !== 1 || (requestUpdate.rowsAffected[0] ?? 0) !== 1) {
      throw new AppError(409, 'This quotation has already been processed.', 'CUSTOM_QUOTE_STATE_CONFLICT');
    }
    const historyRequest = new sql.Request(transaction);
    await insertBookingStatusHistory({ reservationId, previousStatus: 'PENDING', nextStatus: 'APPROVED',
      actor: { type: 'CUSTOMER', id: customerId }, reason: 'Custom quotation accepted.' }, historyRequest);
    await insertBookingStatusHistory({ reservationId, previousStatus: 'APPROVED', nextStatus: 'AWAITING_PAYMENT',
      actor: { type: 'CUSTOMER', id: customerId }, reason: 'Custom quotation accepted.' }, historyRequest);
    await queueCustomEventNotification(reservationId, requestId, 'CUSTOM_QUOTE_ACCEPTED', new sql.Request(transaction),
      { quoteTotal: Number(row['total_amount']).toFixed(2) });
    await transaction.commit();
    return { requestId, reservationId, quoteId, invoiceId, paymentId, status: 'ACCEPTED' };
  } catch (error) { try { await transaction.rollback(); } catch { /* Preserve original failure. */ } throw error; }
}

export async function declineCustomQuote(
  customerId: number,
  requestId: number,
  quoteId: number,
  reason?: string,
): Promise<void> {
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input('customerId', sql.Int, customerId).input('requestId', sql.Int, requestId).input('quoteId', sql.Int, quoteId)
      .query<Record<string, unknown>>(`/* custom quote acceptance lock */
        SELECT q.status request_status,q.reservation_id,r.status reservation_status,r.accepted_quote_id,
          cq.quote_id,cq.status quote_status,CONVERT(varchar(10),cq.valid_until,23) valid_until
        FROM dbo.CUSTOM_EVENT_REQUEST q WITH(UPDLOCK,HOLDLOCK)
        JOIN dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK) ON r.reservation_id=q.reservation_id
        LEFT JOIN dbo.CUSTOM_QUOTE cq WITH(UPDLOCK,HOLDLOCK) ON cq.request_id=q.request_id AND cq.quote_id=@quoteId
        WHERE q.request_id=@requestId AND r.customer_id=@customerId`);
    const row = locked.recordset[0];
    if (!row || row['quote_id'] === null || row['quote_id'] === undefined) throw new AppError(404, 'Custom event request not found.');
    assertRequestTransition(String(row['request_status']) as CustomEventRequestStatus, 'DECLINED');
    assertQuoteTransition(String(row['quote_status']) as CustomQuoteStatus, 'DECLINED');
    const current = await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query<Record<string, unknown>>(`/* current sent quote */ SELECT TOP 1 quote_id FROM dbo.CUSTOM_QUOTE WITH(UPDLOCK,HOLDLOCK)
        WHERE request_id=@requestId AND status='SENT' ORDER BY version DESC`);
    if (Number(current.recordset[0]?.['quote_id']) !== quoteId || String(row['reservation_status']) !== 'PENDING') {
      throw new AppError(409, 'This quotation is no longer the current version.', 'CUSTOM_QUOTE_NOT_CURRENT');
    }
    await new sql.Request(transaction).input('quoteId', sql.Int, quoteId)
      .query(`UPDATE dbo.CUSTOM_QUOTE SET status='DECLINED',declined_at=sysutcdatetime() WHERE quote_id=@quoteId AND status='SENT'`);
    await new sql.Request(transaction).input('requestId', sql.Int, requestId)
      .query(`UPDATE dbo.CUSTOM_EVENT_REQUEST SET status='DECLINED',updated_at=sysutcdatetime() WHERE request_id=@requestId AND status='QUOTE_SENT'`);
    const reservationId = Number(row['reservation_id']);
    await new sql.Request(transaction).input('reservationId', sql.Int, reservationId)
      .query(`UPDATE dbo.RESERVATION SET status='CANCELLED' WHERE reservation_id=@reservationId AND status='PENDING'`);
    await insertBookingStatusHistory({ reservationId, previousStatus: 'PENDING', nextStatus: 'CANCELLED',
      actor: { type: 'CUSTOMER', id: customerId }, reason: reason ?? 'Custom quotation declined.' }, new sql.Request(transaction));
    await queueCustomEventNotification(reservationId, requestId, 'CUSTOM_QUOTE_DECLINED', new sql.Request(transaction));
    await transaction.commit();
  } catch (error) { try { await transaction.rollback(); } catch { /* Preserve original failure. */ } throw error; }
}
