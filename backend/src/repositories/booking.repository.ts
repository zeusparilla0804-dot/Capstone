import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { getDbPool } from '../config/database.js';
import type { BookingRecord, CreateBookingDto } from '../types/domain.types.js';
import { findAddOns, findPackageById } from './catalog.repository.js';
import { AppError } from '../utils/app-error.js';

function dateOnly(value: Date | string): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function timeOnly(value: Date | string): string { return value instanceof Date ? value.toISOString().slice(11, 16) : String(value).slice(0, 5); }

export async function createBooking(customerId: number, dto: CreateBookingDto): Promise<BookingRecord> {
  const pool = await getDbPool(); const transaction = new sql.Transaction(pool); await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const pkg = await findPackageById(dto.packageId, request); if (!pkg) throw new AppError(400, 'Selected package is unavailable.');
    if (pkg.category.toLowerCase() !== dto.eventType.toLowerCase()) throw new AppError(400, 'Selected package does not match the event type.');
    if (dto.guestCount < pkg.minGuests || dto.guestCount > pkg.maxGuests) throw new AppError(400, `Guest count must be between ${pkg.minGuests} and ${pkg.maxGuests}.`);
    const addOns = await findAddOns(dto.addOnIds, new sql.Request(transaction));
    if (addOns.length !== new Set(dto.addOnIds).size) throw new AppError(400, 'One or more add-ons are unavailable.');
    const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const packageTotal = money(pkg.pricePerGuest * dto.guestCount);
    const addOnTotal = money(addOns.reduce((sum, item) => sum + item.price, 0));
    const subtotal = money(packageTotal + addOnTotal); const total = subtotal; const reference = `BK-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const eventResult = await new sql.Request(transaction).input('eventType', sql.NVarChar(100), dto.eventType).query('SELECT event_id FROM dbo.EVENT WHERE LOWER(event_type)=LOWER(@eventType)');
    const eventId = eventResult.recordset[0]?.event_id; if (!eventId) throw new AppError(400, 'Event type is unavailable.');
    const eventDate = new Date(`${dto.eventDate}T00:00:00Z`); const eventTime = new Date(`1970-01-01T${dto.eventTime}:00Z`);
    const insert = await new sql.Request(transaction).input('customerId',sql.Int,customerId).input('eventId',sql.Int,eventId).input('packageId',sql.Int,dto.packageId).input('reference',sql.NVarChar(30),reference).input('eventDate',sql.Date,eventDate).input('eventTime',sql.Time,eventTime).input('guestCount',sql.Int,dto.guestCount).input('venue',sql.NVarChar(500),dto.venue).input('unitPrice',sql.Decimal(12,2),pkg.pricePerGuest).input('subtotal',sql.Decimal(12,2),subtotal).input('total',sql.Decimal(12,2),total).query(`INSERT dbo.RESERVATION(customer_id,event_id,package_id,booking_reference,event_date,event_time,guest_count,venue_address,status,package_unit_price,subtotal,total_amount) OUTPUT INSERTED.reservation_id,INSERTED.created_at VALUES(@customerId,@eventId,@packageId,@reference,@eventDate,@eventTime,@guestCount,@venue,'PENDING',@unitPrice,@subtotal,@total)`);
    const id = Number(insert.recordset[0].reservation_id);
    for (const addOn of addOns) await new sql.Request(transaction).input('reservationId',sql.Int,id).input('addOnId',sql.Int,addOn.id).input('price',sql.Decimal(12,2),addOn.price).query('INSERT dbo.RESERVATION_ADD_ON(reservation_id,add_on_id,unit_price) VALUES(@reservationId,@addOnId,@price)');
    const method=dto.paymentMethod==='bank-transfer'?'BANK_TRANSFER':dto.paymentMethod==='cash'?'CASH':dto.paymentMethod==='e-wallet'?'E-WALLET':null;
    await new sql.Request(transaction).input('reservationId',sql.Int,id).input('due',sql.Decimal(12,2),total).input('method',sql.NVarChar(50),method).query(`INSERT dbo.PAYMENT(reservation_id,amount_due,amount_paid,payment_method,status) VALUES(@reservationId,@due,0,@method,'PENDING')`);
    await transaction.commit();
    return { id, reference, eventName: `${pkg.category} Event`, eventType: pkg.category, eventDate:dto.eventDate,eventTime:dto.eventTime,venue:dto.venue,guestCount:dto.guestCount,package:{packageId:pkg.id,packageName:pkg.name,pricePerGuest:pkg.pricePerGuest},addOns,discount:0,total,status:'pending',amountPaid:0,createdAt:new Date(insert.recordset[0].created_at).toISOString() };
  } catch (error) { await transaction.rollback(); throw error; }
}

export async function findCustomerBookings(customerId: number): Promise<BookingRecord[]> {
  const pool=await getDbPool(); const result=await pool.request().input('customerId',sql.Int,customerId).query(`SELECT r.reservation_id,i.invoice_id,r.booking_reference,r.event_date,r.event_time,r.guest_count,r.venue_address,r.status,r.package_unit_price,r.discount_amount,r.total_amount,r.created_at,e.event_type,p.package_id,p.package_name,COALESCE(pay.amount_paid,0) amount_paid FROM dbo.RESERVATION r JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id WHERE r.customer_id=@customerId ORDER BY r.event_date DESC`);
  const bookings: BookingRecord[]=[];
  for(const row of result.recordset){ const addResult=await pool.request().input('id',sql.Int,row.reservation_id).query(`SELECT a.add_on_id,a.add_on_name,a.description,ra.unit_price FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.ADD_ON a ON a.add_on_id=ra.add_on_id WHERE ra.reservation_id=@id`); bookings.push({id:Number(row.reservation_id),invoiceId:row.invoice_id?Number(row.invoice_id):undefined,reference:row.booking_reference,eventName:`${row.event_type} Event`,eventType:String(row.event_type).toLowerCase(),eventDate:dateOnly(row.event_date),eventTime:timeOnly(row.event_time),venue:row.venue_address,guestCount:row.guest_count,package:{packageId:Number(row.package_id),packageName:row.package_name,pricePerGuest:Number(row.package_unit_price)},addOns:addResult.recordset.map(a=>({id:Number(a.add_on_id),name:a.add_on_name,description:a.description??'',price:Number(a.unit_price)})),discount:Number(row.discount_amount),total:Number(row.total_amount),status:String(row.status).toLowerCase(),amountPaid:Number(row.amount_paid),createdAt:new Date(row.created_at).toISOString()}); }
  return bookings;
}
