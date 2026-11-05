import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.js';
import type { BookingRecord, CreateBookingDto, PackagePricingSnapshot, PackageRecord, UpdatePendingBookingDto } from '../types/domain.types.js';
import { findAddOns, findPackageById } from './catalog.repository.js';
import { AppError } from '../utils/app-error.js';
import { queueBookingNotification } from '../services/notification.service.js';
import { bookingAvailabilityService } from '../services/booking-availability.service.js';
import { calculatePackagePrice } from '../services/package-pricing.service.js';
import { priceSelectedAddOns } from '../services/add-on-quantity.service.js';
import { assertCashPaymentWindow } from '../services/cash-payment-policy.js';
import { assertCustomerBookingDate, bookingSubmissionHash, parseBookingSubmissionKey } from '../services/booking-submission-policy.js';
import { lockedBookingSubmission, saveBookingSubmission } from './booking-submission.repository.js';

export async function assertOwnedPendingBooking(customerId: number, reservationId: number): Promise<void> {
  const result = await (await getDbPool()).request()
    .input('customerId', sql.Int, customerId)
    .input('reservationId', sql.Int, reservationId)
    .query(`SELECT reservation_id FROM dbo.RESERVATION
      WHERE reservation_id=@reservationId AND customer_id=@customerId AND status='PENDING'`);
  if (!result.recordset[0]) throw new AppError(404, 'Pending booking not found.');
}

function dateOnly(value: Date | string): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function timeOnly(value: Date | string): string { return value instanceof Date ? value.toISOString().slice(11, 16) : String(value).slice(0, 5); }
function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function customerPaymentMethod(value?: string | null): string | undefined {
  const method = value?.toUpperCase().replaceAll('_', '-');
  return method === 'CASH' ? 'cash' : method === 'BANK-TRANSFER' ? 'bank-transfer' : method === 'E-WALLET' ? 'gcash' : undefined;
}

function paymentMethod(value?: string): string | null {
  return value === 'bank-transfer' ? 'BANK_TRANSFER' : value === 'cash' ? 'CASH' : value === 'e-wallet' ? 'E-WALLET' : null;
}
function packageMatchesEvent(category: string, eventType: string): boolean {
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedEventType = eventType.trim().toLowerCase();
  if (normalizedCategory === 'standard' || normalizedCategory === 'standard catering') return true;
  if (normalizedCategory === 'custom' || normalizedCategory === 'custom event') return normalizedEventType === 'other';
  return normalizedCategory === normalizedEventType;
}
function packageSnapshot(pkg: PackageRecord, pricing: PackagePricingSnapshot) {
  return { packageId: pkg.id, packageName: pkg.name, ...pricing };
}

export async function createBooking(customerId: number, dto: CreateBookingDto): Promise<BookingRecord> {
  const submissionKey = parseBookingSubmissionKey(dto.submissionKey);
  const requestHash = submissionKey ? bookingSubmissionHash(dto) : undefined;
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    if (submissionKey) {
      const previous = await lockedBookingSubmission(customerId, submissionKey, requestHash!, new sql.Request(transaction));
      if (previous) { await transaction.commit(); return previous; }
      // Replay must succeed even after the original event/payment window has passed.
      assertCustomerBookingDate(dto.eventDate);
      if (dto.paymentMethod === 'cash') assertCashPaymentWindow(dto.eventDate, dto.guestCount);
    }
    const request = new sql.Request(transaction);
    const pkg = await findPackageById(dto.packageId, request); if (!pkg) throw new AppError(400, 'Selected package is unavailable.');
    if (!packageMatchesEvent(pkg.category, dto.eventType)) throw new AppError(400, 'Selected package does not match the event type.');
    const { packageTotal, pricingSnapshot } = calculatePackagePrice(pkg, dto.guestCount);
    await bookingAvailabilityService.assertCanAccept(dto.eventDate, dto.guestCount, new sql.Request(transaction));
    const addOns = priceSelectedAddOns(await findAddOns(dto.addOnIds, new sql.Request(transaction)), dto.addOnQuantities);
    if (addOns.length !== new Set(dto.addOnIds).size) throw new AppError(400, 'One or more add-ons are unavailable.');
    const addOnTotal = money(addOns.reduce((sum, item) => sum + item.price, 0));
    const subtotal = money(packageTotal + addOnTotal); const total = subtotal; const reference = `BK-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const eventResult = await new sql.Request(transaction).input('eventType', sql.NVarChar(100), dto.eventType).query('SELECT event_id FROM dbo.EVENT WHERE LOWER(event_type)=LOWER(@eventType)');
    const eventId = eventResult.recordset[0]?.event_id; if (!eventId) throw new AppError(400, 'Event type is unavailable.');
    const eventDate = new Date(`${dto.eventDate}T00:00:00Z`); const eventTime = new Date(`1970-01-01T${dto.eventTime}:00Z`);
    const insert = await new sql.Request(transaction)
      .input('customerId', sql.Int, customerId)
      .input('eventId', sql.Int, eventId)
      .input('packageId', sql.Int, dto.packageId)
      .input('reference', sql.NVarChar(30), reference)
      .input('eventDate', sql.Date, eventDate)
      .input('eventTime', sql.Time, eventTime)
      .input('guestCount', sql.Int, dto.guestCount)
      .input('venue', sql.NVarChar(500), dto.venue)
      .input('specialRequest', sql.NVarChar(2000), dto.specialRequest ?? null)
      .input('packageName', sql.NVarChar(150), pkg.name)
      .input('pricingType', sql.VarChar(20), pricingSnapshot.pricingType)
      .input('unitPrice', sql.Decimal(12,2), pricingSnapshot.pricePerGuest)
      .input('basePrice', sql.Decimal(12,2), pricingSnapshot.basePrice)
      .input('includedGuests', sql.Int, pricingSnapshot.includedGuests)
      .input('excessGuestPrice', sql.Decimal(12,2), pricingSnapshot.excessGuestPrice)
      .input('packageTotal', sql.Decimal(12,2), packageTotal)
      .input('subtotal', sql.Decimal(12,2), subtotal)
      .input('total', sql.Decimal(12,2), total)
      .query(`INSERT dbo.RESERVATION(
        customer_id,event_id,package_id,booking_reference,event_date,event_time,guest_count,
        venue_address,special_request,status,package_name_snapshot,package_pricing_type,
        package_unit_price,package_base_price,package_included_guests,package_excess_guest_price,
        package_total,subtotal,total_amount
      ) OUTPUT INSERTED.reservation_id,INSERTED.created_at VALUES(
        @customerId,@eventId,@packageId,@reference,@eventDate,@eventTime,@guestCount,
        @venue,@specialRequest,'PENDING',@packageName,@pricingType,@unitPrice,@basePrice,
        @includedGuests,@excessGuestPrice,@packageTotal,@subtotal,@total
      )`);
    const id = Number(insert.recordset[0].reservation_id);
    for (const addOn of addOns) await new sql.Request(transaction).input('reservationId',sql.Int,id).input('addOnId',sql.Int,addOn.id).input('price',sql.Decimal(12,2),addOn.unitPrice).input('quantity',sql.Int,addOn.quantity).query('INSERT dbo.RESERVATION_ADD_ON(reservation_id,add_on_id,unit_price,quantity) VALUES(@reservationId,@addOnId,@price,@quantity)');
    const method=paymentMethod(dto.paymentMethod);
    await new sql.Request(transaction).input('reservationId',sql.Int,id).input('due',sql.Decimal(12,2),total).input('method',sql.NVarChar(50),method).query(`INSERT dbo.PAYMENT(reservation_id,amount_due,amount_paid,payment_method,status) VALUES(@reservationId,@due,0,@method,'PENDING')`);
    await queueBookingNotification(id, 'BOOKING_RECEIVED', new sql.Request(transaction));
    const response: BookingRecord = { id, reference, eventName: `${dto.eventType} Event`, eventType: dto.eventType, eventDate:dto.eventDate,eventTime:dto.eventTime,venue:dto.venue,guestCount:dto.guestCount,specialRequest:dto.specialRequest,package:packageSnapshot(pkg,pricingSnapshot),addOns,discount:0,total,status:'pending',paymentMethod:customerPaymentMethod(dto.paymentMethod),amountPaid:0,createdAt:new Date(insert.recordset[0].created_at).toISOString() };
    if (submissionKey) await saveBookingSubmission(customerId, submissionKey, requestHash!, response, new sql.Request(transaction));
    await transaction.commit();
    return response;
  } catch (error) { try { await transaction.rollback(); } catch { /* Preserve a lost commit acknowledgement for a safe keyed retry. */ } throw error; }
}

export async function updatePendingBooking(
  customerId: number,
  reservationId: number,
  dto: UpdatePendingBookingDto,
): Promise<BookingRecord> {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const locked = await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId)
      .input('customerId', sql.Int, customerId)
      .query(`SELECT r.reservation_id,r.status,r.booking_reference,r.created_at,r.discount_amount,
          COALESCE(pay.amount_paid,0) amount_paid,pay.payment_method,i.invoice_id
        FROM dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK)
        LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id
        LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id
        WHERE r.reservation_id=@reservationId AND r.customer_id=@customerId`);
    const existing = locked.recordset[0];
    if (!existing) throw new AppError(404, 'Booking not found.', 'BOOKING_NOT_FOUND');
    if (String(existing.status).toUpperCase() !== 'PENDING') {
      throw new AppError(409, 'Only pending bookings can be updated.', 'BOOKING_NOT_PENDING');
    }

    if ((dto.paymentMethod ?? existing.payment_method)?.toUpperCase() === 'CASH') {
      assertCashPaymentWindow(dto.eventDate, dto.guestCount);
    }

    const pkg = await findPackageById(dto.packageId, new sql.Request(transaction));
    if (!pkg) throw new AppError(400, 'Selected package is unavailable.');
    if (!packageMatchesEvent(pkg.category, dto.eventType)) {
      throw new AppError(400, 'Selected package does not match the event type.');
    }
    const { packageTotal, pricingSnapshot } = calculatePackagePrice(pkg, dto.guestCount);
    await bookingAvailabilityService.assertCanAccept(
      dto.eventDate,
      dto.guestCount,
      new sql.Request(transaction),
      reservationId,
    );
    const addOns = priceSelectedAddOns(await findAddOns(dto.addOnIds, new sql.Request(transaction)), dto.addOnQuantities);
    if (addOns.length !== new Set(dto.addOnIds).size) {
      throw new AppError(400, 'One or more add-ons are unavailable.');
    }
    const eventResult = await new sql.Request(transaction)
      .input('eventType', sql.NVarChar(100), dto.eventType)
      .query('SELECT event_id FROM dbo.EVENT WHERE LOWER(event_type)=LOWER(@eventType)');
    const eventId = eventResult.recordset[0]?.event_id;
    if (!eventId) throw new AppError(400, 'Event type is unavailable.');

    const addOnTotal = money(addOns.reduce((sum, item) => sum + item.price, 0));
    const subtotal = money(packageTotal + addOnTotal);
    const total = money(subtotal - Number(existing.discount_amount ?? 0));
    const eventDate = new Date(`${dto.eventDate}T00:00:00Z`);
    const eventTime = new Date(`1970-01-01T${dto.eventTime}:00Z`);
    const updated = await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId)
      .input('customerId', sql.Int, customerId)
      .input('eventId', sql.Int, eventId)
      .input('packageId', sql.Int, dto.packageId)
      .input('eventDate', sql.Date, eventDate)
      .input('eventTime', sql.Time, eventTime)
      .input('guestCount', sql.Int, dto.guestCount)
      .input('venue', sql.NVarChar(500), dto.venue)
      .input('specialRequest', sql.NVarChar(2000), dto.specialRequest ?? null)
      .input('packageName', sql.NVarChar(150), pkg.name)
      .input('pricingType', sql.VarChar(20), pricingSnapshot.pricingType)
      .input('unitPrice', sql.Decimal(12,2), pricingSnapshot.pricePerGuest)
      .input('basePrice', sql.Decimal(12,2), pricingSnapshot.basePrice)
      .input('includedGuests', sql.Int, pricingSnapshot.includedGuests)
      .input('excessGuestPrice', sql.Decimal(12,2), pricingSnapshot.excessGuestPrice)
      .input('packageTotal', sql.Decimal(12,2), packageTotal)
      .input('subtotal', sql.Decimal(12,2), subtotal)
      .input('total', sql.Decimal(12,2), total)
      .query(`UPDATE dbo.RESERVATION SET event_id=@eventId,package_id=@packageId,event_date=@eventDate,
          event_time=@eventTime,guest_count=@guestCount,venue_address=@venue,special_request=@specialRequest,
          package_name_snapshot=@packageName,package_pricing_type=@pricingType,package_unit_price=@unitPrice,
          package_base_price=@basePrice,package_included_guests=@includedGuests,
          package_excess_guest_price=@excessGuestPrice,package_total=@packageTotal,subtotal=@subtotal,total_amount=@total
        WHERE reservation_id=@reservationId AND customer_id=@customerId AND status='PENDING'`);
    if ((updated.rowsAffected[0] ?? 0) !== 1) {
      throw new AppError(409, 'The booking changed before it could be updated.', 'BOOKING_UPDATE_CONFLICT');
    }

    await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId)
      .query('DELETE FROM dbo.RESERVATION_ADD_ON WHERE reservation_id=@reservationId');
    for (const addOn of addOns) {
      await new sql.Request(transaction)
        .input('reservationId', sql.Int, reservationId)
        .input('addOnId', sql.Int, addOn.id)
        .input('price', sql.Decimal(12,2), addOn.unitPrice)
        .input('quantity', sql.Int, addOn.quantity)
        .query('INSERT dbo.RESERVATION_ADD_ON(reservation_id,add_on_id,unit_price,quantity) VALUES(@reservationId,@addOnId,@price,@quantity)');
    }
    await new sql.Request(transaction)
      .input('reservationId', sql.Int, reservationId)
      .input('due', sql.Decimal(12,2), total)
      .input('method', sql.NVarChar(50), paymentMethod(dto.paymentMethod))
      .query(`UPDATE dbo.PAYMENT SET amount_due=@due,payment_method=COALESCE(@method,payment_method)
        WHERE reservation_id=@reservationId AND status='PENDING'`);
    await transaction.commit();

    return {
      id: reservationId,
      invoiceId: existing.invoice_id ? Number(existing.invoice_id) : undefined,
      reference: String(existing.booking_reference),
      eventName: `${dto.eventType} Event`,
      eventType: dto.eventType,
      eventDate: dto.eventDate,
      eventTime: dto.eventTime,
      venue: dto.venue,
      guestCount: dto.guestCount,
      specialRequest: dto.specialRequest,
      package: packageSnapshot(pkg, pricingSnapshot),
      addOns,
      discount: Number(existing.discount_amount ?? 0),
      total,
      status: 'pending',
      paymentMethod: customerPaymentMethod(dto.paymentMethod ?? existing.payment_method),
      amountPaid: Number(existing.amount_paid ?? 0),
      createdAt: new Date(existing.created_at).toISOString(),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function findCustomerBookings(customerId: number): Promise<BookingRecord[]> {
  const pool=await getDbPool(); const result=await pool.request().input('customerId',sql.Int,customerId).query(`SELECT r.reservation_id,i.invoice_id,r.booking_reference,r.event_date,r.event_time,r.guest_count,r.venue_address,r.special_request,r.status,r.package_name_snapshot,r.package_pricing_type,r.package_unit_price,r.package_base_price,r.package_included_guests,r.package_excess_guest_price,r.package_total,r.discount_amount,r.total_amount,r.created_at,e.event_type,p.package_id,p.package_name,COALESCE(pay.amount_paid,0) amount_paid,pay.payment_method FROM dbo.RESERVATION r JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id WHERE r.customer_id=@customerId ORDER BY r.event_date DESC`);
  const bookings: BookingRecord[]=[];
  for(const row of result.recordset){ const addResult=await pool.request().input('id',sql.Int,row.reservation_id).query(`SELECT a.add_on_id,a.add_on_name,a.description,ra.unit_price,ra.quantity FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.ADD_ON a ON a.add_on_id=ra.add_on_id WHERE ra.reservation_id=@id`); const pricingType=row.package_pricing_type??'PER_HEAD'; const unitPrice=row.package_unit_price===null?null:Number(row.package_unit_price); const packageTotal=row.package_total===null||row.package_total===undefined?(unitPrice??0)*Number(row.guest_count):Number(row.package_total); bookings.push({id:Number(row.reservation_id),invoiceId:row.invoice_id?Number(row.invoice_id):undefined,reference:row.booking_reference,eventName:`${row.event_type} Event`,eventType:String(row.event_type).toLowerCase(),eventDate:dateOnly(row.event_date),eventTime:timeOnly(row.event_time),venue:row.venue_address,guestCount:row.guest_count,specialRequest:row.special_request??undefined,package:{packageId:Number(row.package_id),packageName:row.package_name_snapshot??row.package_name,pricingType,pricePerGuest:unitPrice,basePrice:row.package_base_price===null?null:Number(row.package_base_price),includedGuests:row.package_included_guests===null?null:Number(row.package_included_guests),excessGuestPrice:row.package_excess_guest_price===null?null:Number(row.package_excess_guest_price),packageTotal},addOns:addResult.recordset.map(a=>({id:Number(a.add_on_id),name:a.add_on_name,description:a.description??'',price:Number(a.unit_price)*Number(a.quantity??1),unitPrice:Number(a.unit_price),quantity:Number(a.quantity??1)})),discount:Number(row.discount_amount),total:Number(row.total_amount),status:String(row.status).toLowerCase(),paymentMethod:customerPaymentMethod(row.payment_method),amountPaid:Number(row.amount_paid),createdAt:new Date(row.created_at).toISOString()}); }
  return bookings;
}
