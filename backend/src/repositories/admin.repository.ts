import { formatEventTimeChange } from '../utils/event-time.js';
import { bindBankSnapshot, bankSnapshotColumns } from './payment-bank.repository.js';
import { resolvePaymentBankSnapshot, staffBankChoice } from '../services/payment-bank.service.js';
import sql from 'mssql';
import {getDbPool} from '../config/database.js';
import type {AddOnInput,AdminBookingCapacitySummary,AdminDashboard,AuditLogQuery,CustomerHistoryQuery,EmailOutboxQuery,PackageInput,PageQuery,PageResult,PaymentInput,ReportingPeriod} from '../types/admin.types.js';
import {writeAdminAudit} from './audit.repository.js';
import {bookingStatusHistory} from './booking-status.repository.js';
import {transitionBooking} from '../services/booking-status.service.js';
import {queueBookingNotification} from '../services/notification.service.js';
import { assertSupportedPaymentMethod } from '../services/payment-method-policy.js';
import {assessDateAvailability} from '../services/booking-availability.service.js';
import {hasRequiredReservationDeposit} from '../services/reservation-billing-policy.js';

interface AdminBookingCapacityRow {
  eventDate: string;
  guestCount: number;
  activeBookingCount: number | string;
  largestGuestCount: number | string;
  hasMediumEvent: number | boolean;
}

export function mapAdminBookingCapacity<T extends AdminBookingCapacityRow>(row:T):Omit<T,keyof AdminBookingCapacityRow>&Pick<T,'eventDate'|'guestCount'>&{capacity:AdminBookingCapacitySummary}{
 const {activeBookingCount,largestGuestCount,hasMediumEvent,...item}=row;
 const eventDate=String(row.eventDate).slice(0,10);const guestCount=Number(row.guestCount);
 const capacity=assessDateAvailability({date:eventDate,guestCount,snapshot:{activeBookingCount:Number(activeBookingCount),largestGuestCount:Number(largestGuestCount),hasMediumEvent:Boolean(Number(hasMediumEvent))},includeProposed:false});
 return{...item,eventDate,guestCount,capacity} as Omit<T,keyof AdminBookingCapacityRow>&Pick<T,'eventDate'|'guestCount'>&{capacity:AdminBookingCapacitySummary};
}
const pageMeta=<T>(rows:(T&{total_count?:unknown})[],q:PageQuery):PageResult<T>=>{const total=Number(rows[0]?.total_count??0);return{items:rows.map(({total_count:_total,...item})=>item as T),page:q.page,pageSize:q.pageSize,totalItems:total,totalPages:Math.ceil(total/q.pageSize)}};
const pageRequest=async(q:PageQuery)=>(await sqlRequest()).input('search',sql.NVarChar(200),q.search).input('status',sql.NVarChar(50),q.status).input('eventType',sql.NVarChar(100),q.eventType).input('date',sql.VarChar(10),q.date).input('offset',sql.Int,(q.page-1)*q.pageSize).input('pageSize',sql.Int,q.pageSize);
async function sqlRequest(){return (await getDbPool()).request();}

export async function dashboard(){const pool=await getDbPool();const metrics=await pool.request().query(`SELECT (SELECT COUNT(*) FROM dbo.RESERVATION) totalBookings,(SELECT COUNT(*) FROM dbo.RESERVATION WHERE status='PENDING') pendingBookings,(SELECT COUNT(*) FROM dbo.RESERVATION WHERE event_date>=CAST(GETDATE() AS date) AND status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')) upcomingEvents,(SELECT COALESCE(SUM(amount_paid),0) FROM dbo.PAYMENT) totalRevenue,(SELECT COALESCE(SUM(amount_due-amount_paid),0) FROM dbo.PAYMENT WHERE amount_due>amount_paid) outstandingPayments`);const recent=await pool.request().query(`SELECT TOP 8 r.reservation_id id,r.booking_reference reference,CONCAT(c.first_name,' ',c.last_name) customerName,e.event_type eventType,CONVERT(varchar(10),r.event_date,23) eventDate,r.guest_count guestCount,r.status,r.total_amount total FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id JOIN dbo.EVENT e ON e.event_id=r.event_id ORDER BY r.created_at DESC`);return{...metrics.recordset[0],recentBookings:recent.recordset};}
export async function bookings(q:PageQuery){const request=await pageRequest(q);const result=await request.query(`SELECT r.reservation_id id,i.invoice_id invoiceId,r.booking_reference reference,CONCAT(c.first_name,' ',c.last_name) customerName,c.email,e.event_type eventType,CONVERT(varchar(10),r.event_date,23) eventDate,CONVERT(varchar(5),r.event_time,108) eventTime,r.venue_address venue,r.guest_count guestCount,p.package_name packageName,r.total_amount total,COALESCE(pay.amount_paid,0) amountPaid,proof.latestProofStatus,r.status,capacity.activeBookingCount,capacity.largestGuestCount,capacity.hasMediumEvent,COUNT(*) OVER() total_count FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id OUTER APPLY(SELECT TOP(1) pp.status latestProofStatus FROM dbo.PAYMENT_PROOF pp WHERE pp.reservation_id=r.reservation_id ORDER BY pp.created_at DESC,pp.payment_proof_id DESC) proof OUTER APPLY(SELECT COUNT_BIG(*) activeBookingCount,COALESCE(MAX(cr.guest_count),0) largestGuestCount,COALESCE(MAX(CASE WHEN cr.guest_count BETWEEN 150 AND 499 THEN 1 ELSE 0 END),0) hasMediumEvent FROM dbo.RESERVATION cr WHERE cr.event_date=r.event_date AND cr.status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')) capacity WHERE (@search='' OR r.booking_reference LIKE '%'+@search+'%' OR c.first_name+' '+c.last_name LIKE '%'+@search+'%') AND (@status='' OR r.status=@status) AND (@eventType='' OR e.event_type=@eventType) AND (@date='' OR r.event_date=CONVERT(date,@date)) ORDER BY r.created_at DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);return pageMeta(result.recordset.map(mapAdminBookingCapacity),q);}
export async function booking(id:number,request?:sql.Request){const pool=request?undefined:await getDbPool();const main=await (request??pool!.request()).replaceInput('id',sql.Int,id).query(`SELECT r.reservation_id id,i.invoice_id invoiceId,i.invoice_number invoiceNumber,i.status invoiceStatus,r.booking_reference reference,CONCAT(c.first_name,' ',c.last_name) customerName,c.email,c.contact_number phone,e.event_type eventType,CONVERT(varchar(10),r.event_date,23) eventDate,CONVERT(varchar(5),r.event_time,108) eventTime,r.venue_address venue,r.special_request specialRequest,r.guest_count guestCount,p.package_name packageName,r.package_unit_price packageUnitPrice,r.subtotal,r.discount_amount discount,r.total_amount total,r.status,COALESCE(pay.amount_paid,0) amountPaid,pay.payment_method paymentMethod,destination.label paymentDestinationLabel,proof.latestProofStatus,capacity.activeBookingCount,capacity.largestGuestCount,capacity.hasMediumEvent FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id JOIN dbo.EVENT e ON e.event_id=r.event_id LEFT JOIN dbo.PACKAGE p ON p.package_id=r.package_id LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id OUTER APPLY(SELECT TOP(1) pt.destination_label label FROM dbo.PAYMENT_TRANSACTION pt WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_transaction_id DESC) destination LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id OUTER APPLY(SELECT TOP(1) pp.status latestProofStatus FROM dbo.PAYMENT_PROOF pp WHERE pp.reservation_id=r.reservation_id ORDER BY pp.created_at DESC,pp.payment_proof_id DESC) proof OUTER APPLY(SELECT COUNT_BIG(*) activeBookingCount,COALESCE(MAX(cr.guest_count),0) largestGuestCount,COALESCE(MAX(CASE WHEN cr.guest_count BETWEEN 150 AND 499 THEN 1 ELSE 0 END),0) hasMediumEvent FROM dbo.RESERVATION cr WHERE cr.event_date=r.event_date AND cr.status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')) capacity WHERE r.reservation_id=@id`);if(!main.recordset[0])return undefined;const extras=await (request??pool!.request()).replaceInput('id',sql.Int,id).query(`SELECT a.add_on_name name,ra.quantity,ra.unit_price unitPrice,ra.unit_price*ra.quantity price FROM dbo.RESERVATION_ADD_ON ra JOIN dbo.ADD_ON a ON a.add_on_id=ra.add_on_id WHERE ra.reservation_id=@id`);return{...mapAdminBookingCapacity(main.recordset[0]),addOns:extras.recordset,statusHistory:await bookingStatusHistory(id,request??pool!.request())};}
export async function customers(q:PageQuery){const request=await pageRequest(q);const result=await request.query(`SELECT c.customer_id id,CONCAT(c.first_name,' ',c.last_name) fullName,c.email,c.contact_number phone,c.status,COUNT(r.reservation_id) totalBookings,MIN(CASE WHEN r.event_date>=CAST(GETDATE() AS date) THEN r.event_date END) upcomingEvent,COALESCE(SUM(CASE WHEN pay.amount_due>pay.amount_paid THEN pay.amount_due-pay.amount_paid ELSE 0 END),0) outstandingBalance,COUNT(*) OVER() total_count FROM dbo.CUSTOMER c LEFT JOIN dbo.RESERVATION r ON r.customer_id=c.customer_id LEFT JOIN dbo.PAYMENT pay ON pay.reservation_id=r.reservation_id WHERE(@search='' OR c.first_name+' '+c.last_name LIKE '%'+@search+'%' OR c.email LIKE '%'+@search+'%' OR c.contact_number LIKE '%'+@search+'%') GROUP BY c.customer_id,c.first_name,c.last_name,c.email,c.contact_number,c.status,c.created_at ORDER BY c.created_at DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);return pageMeta(result.recordset,q);}
export async function customer(id:number){const pool=await getDbPool();const result=await pool.request().input('id',sql.Int,id).query(`SELECT customer_id id,first_name firstName,last_name lastName,email,contact_number phone,address,status,created_at createdAt FROM dbo.CUSTOMER WHERE customer_id=@id`);return result.recordset[0];}
export async function packages(){const pool=await getDbPool();return(await pool.request().query(`SELECT p.package_id id,p.event_id eventId,e.event_type eventType,p.package_name name,p.description,p.pricing_type pricingType,p.price_per_head pricePerGuest,p.base_price basePrice,p.included_guests includedGuests,p.excess_guest_price excessGuestPrice,p.min_guest minGuests,p.max_guest maxGuests,p.is_active isActive FROM dbo.PACKAGE p JOIN dbo.EVENT e ON e.event_id=p.event_id ORDER BY p.package_name`)).recordset;}
export async function eventTypes(){const pool=await getDbPool();return(await pool.request().query('SELECT event_id id,event_type name FROM dbo.EVENT ORDER BY event_type')).recordset;}
function bindPackage(request:sql.Request,v:PackageInput){return request.input('eventId',sql.Int,v.eventId).input('name',sql.NVarChar(150),v.name).input('description',sql.NVarChar(1000),v.description).input('pricingType',sql.VarChar(20),v.pricingType).input('pricePerGuest',sql.Decimal(12,2),v.pricePerGuest).input('basePrice',sql.Decimal(12,2),v.basePrice).input('includedGuests',sql.Int,v.includedGuests).input('excessGuestPrice',sql.Decimal(12,2),v.excessGuestPrice).input('min',sql.Int,v.minGuests).input('max',sql.Int,v.maxGuests).input('active',sql.Bit,v.isActive);}
export async function createPackage(v:PackageInput){const pool=await getDbPool();const result=await bindPackage(pool.request(),v).query(`INSERT dbo.PACKAGE(event_id,package_name,description,pricing_type,price_per_head,base_price,included_guests,excess_guest_price,min_guest,max_guest,is_active) OUTPUT INSERTED.package_id VALUES(@eventId,@name,@description,@pricingType,@pricePerGuest,@basePrice,@includedGuests,@excessGuestPrice,@min,@max,@active)`);return Number(result.recordset[0].package_id);}
export async function updatePackage(id:number,v:PackageInput){const pool=await getDbPool();const r=await bindPackage(pool.request().input('id',sql.Int,id),v).query(`UPDATE dbo.PACKAGE SET event_id=@eventId,package_name=@name,description=@description,pricing_type=@pricingType,price_per_head=@pricePerGuest,base_price=@basePrice,included_guests=@includedGuests,excess_guest_price=@excessGuestPrice,min_guest=@min,max_guest=@max,is_active=@active WHERE package_id=@id`);return(r.rowsAffected[0]??0)>0;}
export async function addOns(){const pool=await getDbPool();return(await pool.request().query('SELECT add_on_id id,add_on_name name,description,price,is_active isActive FROM dbo.ADD_ON ORDER BY add_on_name')).recordset;}
export async function createAddOn(v:AddOnInput){const pool=await getDbPool();const result=await pool.request().input('name',sql.NVarChar(150),v.name).input('description',sql.NVarChar(1000),v.description).input('price',sql.Decimal(12,2),v.price).input('active',sql.Bit,v.isActive).query('INSERT dbo.ADD_ON(add_on_name,description,price,is_active) OUTPUT INSERTED.add_on_id VALUES(@name,@description,@price,@active)');return Number(result.recordset[0].add_on_id);}
export async function updateAddOn(id:number,v:AddOnInput){const pool=await getDbPool();const r=await pool.request().input('id',sql.Int,id).input('name',sql.NVarChar(150),v.name).input('description',sql.NVarChar(1000),v.description).input('price',sql.Decimal(12,2),v.price).input('active',sql.Bit,v.isActive).query('UPDATE dbo.ADD_ON SET add_on_name=@name,description=@description,price=@price,is_active=@active WHERE add_on_id=@id');return(r.rowsAffected[0]??0)>0;}
export async function payments(q:PageQuery){const request=(await pageRequest(q)).input('paymentMethod',sql.NVarChar(50),q.paymentMethod??'');const result=await request.query(`SELECT pay.payment_id id,r.reservation_id reservationId,r.status bookingStatus,r.booking_reference bookingReference,CONCAT(c.first_name,' ',c.last_name) customerName,pay.amount_due amountDue,pay.amount_paid amountPaid,proof.latestProofStatus,pay.payment_method paymentMethod,destination.label paymentDestinationLabel,pay.payment_date paymentDate,pay.transaction_ref reference,pay.status,COUNT(*) OVER() total_count FROM dbo.PAYMENT pay JOIN dbo.RESERVATION r ON r.reservation_id=pay.reservation_id JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id OUTER APPLY(SELECT TOP(1) pt.destination_label label FROM dbo.PAYMENT_TRANSACTION pt WHERE pt.payment_id=pay.payment_id ORDER BY pt.payment_transaction_id DESC) destination OUTER APPLY(SELECT TOP(1) pp.status latestProofStatus FROM dbo.PAYMENT_PROOF pp WHERE pp.reservation_id=r.reservation_id ORDER BY pp.created_at DESC,pp.payment_proof_id DESC) proof WHERE(@search='' OR r.booking_reference LIKE '%'+@search+'%' OR c.first_name+' '+c.last_name LIKE '%'+@search+'%') AND(@status='' OR pay.status=@status) AND(@paymentMethod='' OR pay.payment_method=@paymentMethod) ORDER BY pay.payment_id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);return pageMeta(result.recordset,q);}
export async function recordPayment(adminId:number,v:PaymentInput,options:{completeEvent?:boolean}={}){
 assertSupportedPaymentMethod(v.method);
 const pool=await getDbPool();const tx=new sql.Transaction(pool);await tx.begin();
 try{
  // Shared lock order with proof submission and verification: reservation, payment, then receipt.
  const bookingResult=await new sql.Request(tx).input('reservationId',sql.Int,v.reservationId)
   .query('SELECT status,customer_id customerId,CONVERT(varchar(10),event_date,23) eventDate FROM dbo.RESERVATION WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId');
  const booking=bookingResult.recordset[0];if(!booking){await tx.rollback();return false;}
  const current=await new sql.Request(tx).input('reservationId',sql.Int,v.reservationId)
   .query('SELECT payment_id,amount_due,amount_paid,payment_method FROM dbo.PAYMENT WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId');
  const row=current.recordset[0];if(!row){await tx.rollback();return false;}
  const request=new sql.Request(tx);
  if(options.completeEvent){
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(!booking.eventDate||booking.eventDate>today)throw new Error('EVENT_NOT_FINISHED');
   if(!['PAYMENT_VERIFIED','CONFIRMED','COMPLETED'].includes(String(booking.status).toUpperCase()))throw new Error('PAYMENT_BOOKING_STATUS');
   if(v.paymentDate>today||v.paymentDate<booking.eventDate)throw new Error('FINAL_PAYMENT_DATE');
  }
  const completeEvent=async()=>{
   if(!options.completeEvent)return;
   let status=String(booking.status).toUpperCase();
   if(status==='PAYMENT_VERIFIED'){
    await transitionBooking({reservationId:v.reservationId,expectedStatus:'PAYMENT_VERIFIED',nextStatus:'CONFIRMED',actor:{type:'ADMIN',id:adminId},reason:'Final payment received and event completion confirmed by staff.',request});
    status='CONFIRMED';
   }
   if(status==='CONFIRMED')await transitionBooking({reservationId:v.reservationId,expectedStatus:'CONFIRMED',nextStatus:'COMPLETED',actor:{type:'ADMIN',id:adminId},reason:'Event finished and full payment recorded.',request});
  };
  // The existing unique (method, reference) index is the durable replay key. HOLDLOCK also
  // serializes a missing reference, so concurrent retries cannot create two credits.
  if(v.reference){
   const previous=await new sql.Request(tx).input('method',sql.NVarChar(50),v.method).input('reference',sql.NVarChar(150),v.reference)
    .query('SELECT payment_id,amount,destination_id,destination_version,CONVERT(varchar(10),payment_date,23) payment_date FROM dbo.PAYMENT_TRANSACTION WITH(UPDLOCK,HOLDLOCK) WHERE payment_method=@method AND transaction_ref=@reference');
   const entry=previous.recordset[0];
   if(entry){
    if(Number(entry.payment_id)!==Number(row.payment_id)||Math.round(Number(entry.amount)*100)!==Math.round(v.amount*100)||entry.payment_date!==v.paymentDate||(v.destinationId!==undefined&&(Number(entry.destination_id)!==v.destinationId||entry.destination_version!==v.destinationVersion)))throw new Error('PAYMENT_REFERENCE_CONFLICT');
    if(options.completeEvent&&Math.round(Number(row.amount_paid)*100)<Math.round(Number(row.amount_due)*100))throw new Error('FINAL_BALANCE_CHANGED');
    await completeEvent();await tx.commit();return true;
   }
  }
  if(!['AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED','COMPLETED'].includes(String(booking.status).toUpperCase()))throw new Error('PAYMENT_BOOKING_STATUS');
  const previousMethod=String(row.payment_method??'').toUpperCase();
  const retiredMethodRecovery=previousMethod==='E-WALLET'&&['CASH','BANK_TRANSFER'].includes(v.method);
  const additionalInstallment=Number(row.amount_paid)>0&&['CASH','BANK_TRANSFER'].includes(previousMethod);
  if(!options.completeEvent&&previousMethod!==v.method&&!retiredMethodRecovery&&!additionalInstallment)throw new Error('PAYMENT_METHOD_NOT_SELECTED');
  if(options.completeEvent&&Math.round(v.amount*100)!==Math.max(0,Math.round(Number(row.amount_due)*100)-Math.round(Number(row.amount_paid)*100)))throw new Error('FINAL_BALANCE_CHANGED');
  if(options.completeEvent&&v.amount===0){await completeEvent();await tx.commit();return true;}
  const cumulativeCents=Math.round(Number(row.amount_paid)*100)+Math.round(v.amount*100);
  if(cumulativeCents>Math.round(Number(row.amount_due)*100))throw new Error('OVERPAYMENT');
  const cumulativePaid=cumulativeCents/100;
  staffBankChoice(v.method,v.amount,v.destinationId,v.destinationVersion);
  const bank=v.method==='BANK_TRANSFER'?await resolvePaymentBankSnapshot(v.reservationId,v.destinationId,v.destinationVersion,request):undefined;
  await new sql.Request(tx).input('reservationId',sql.Int,v.reservationId).query(`UPDATE dbo.PAYMENT_PROOF SET status='SUPERSEDED',archived_transaction_reference=transaction_reference,transaction_reference=NULL,updated_at=SYSUTCDATETIME() WHERE reservation_id=@reservationId AND status='SUBMITTED'`);
  await bindBankSnapshot(new sql.Request(tx),bank).input('paymentId',sql.Int,row.payment_id).input('adminId',sql.Int,adminId).input('amount',sql.Decimal(12,2),v.amount).input('method',sql.NVarChar(50),v.method).input('reference',sql.NVarChar(150),v.reference??null).input('date',sql.DateTime2,new Date(v.paymentDate)).query('INSERT dbo.PAYMENT_TRANSACTION(payment_id,admin_id,amount,payment_method,transaction_ref,payment_date,destination_id,destination_label,destination_account_name,destination_account_hint,destination_version) VALUES(@paymentId,@adminId,@amount,@method,@reference,@date,@destinationId,@destinationLabel,@destinationAccountName,@destinationAccountHint,@destinationVersion)');
  await new sql.Request(tx).input('paymentId',sql.Int,row.payment_id).input('amount',sql.Decimal(12,2),v.amount).input('method',sql.NVarChar(50),v.method).input('reference',sql.NVarChar(150),v.reference??null).input('date',sql.DateTime2,new Date(v.paymentDate)).query(`UPDATE dbo.PAYMENT SET amount_paid=amount_paid+@amount,payment_method=@method,transaction_ref=@reference,payment_date=@date,status=CASE WHEN amount_paid+@amount>=amount_due THEN 'PAID' ELSE 'PARTIALLY_PAID' END WHERE payment_id=@paymentId`);
  await new sql.Request(tx).input('reservationId',sql.Int,v.reservationId).query(`UPDATE i SET status=CASE WHEN p.amount_paid>=i.total_amount THEN 'PAID' WHEN p.amount_paid>0 THEN 'PARTIALLY_PAID' ELSE 'ISSUED' END FROM dbo.INVOICE i JOIN dbo.PAYMENT p ON p.reservation_id=i.reservation_id WHERE i.reservation_id=@reservationId AND i.status<>'CANCELLED'`);
  const depositSatisfied=hasRequiredReservationDeposit(Number(row.amount_due),cumulativePaid);
  if((booking.status==='AWAITING_PAYMENT'||booking.status==='PAYMENT_SUBMITTED')&&depositSatisfied){
   await transitionBooking({reservationId:v.reservationId,expectedStatus:booking.status,nextStatus:'PAYMENT_VERIFIED',actor:{type:'ADMIN',id:adminId},reason:'Required reservation deposit received.',request});
  }else if(booking.status==='PAYMENT_SUBMITTED'&&!depositSatisfied){
   await transitionBooking({reservationId:v.reservationId,expectedStatus:'PAYMENT_SUBMITTED',nextStatus:'AWAITING_PAYMENT',actor:{type:'ADMIN',id:adminId},reason:'Partial payment recorded below the required reservation deposit.',request});
  }
  await writeAdminAudit({adminId,action:'PAYMENT_RECORDED',entityType:'PAYMENT',entityId:Number(row.payment_id),oldValues:{amountPaid:Number(row.amount_paid),method:previousMethod},newValues:{amountPaid:cumulativePaid,amount:v.amount,method:v.method,reference:v.reference??null}},request);
  await queueBookingNotification(v.reservationId,'PAYMENT_RECORDED',request,{amount:v.amount.toFixed(2)});
  await completeEvent();
  await tx.commit();return true;
 }catch(error){try{await tx.rollback();}catch{/* Preserve the original failure. */}throw error;}
}

interface AdminOperationsDependencies {
  readRequest: () => Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
}

function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

function dateValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function paged<T>(rows: (T & { total_count?: unknown })[], query: CustomerHistoryQuery): PageResult<T> {
  const totalItems = numberValue(rows[0]?.total_count);
  return {
    items: rows.map(row => {
      const { total_count: _total, ...item } = row;
      return item as T;
    }),
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize)
  };
}

async function operationsTransaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const result = await work(new sql.Request(transaction));
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

export function createAdminOperationsRepository(deps: AdminOperationsDependencies) {
  return {
    async dashboard(period: ReportingPeriod): Promise<AdminDashboard> {
      const result = await (await deps.readRequest())
        .replaceInput('periodStart', sql.DateTime2, period.start)
        .replaceInput('periodEnd', sql.DateTime2, period.end)
        .query(`
          DECLARE @today date=CONVERT(date,DATEADD(hour,8,SYSUTCDATETIME()));
          DECLARE @nextSeven date=DATEADD(day,7,@today);
          DECLARE @serverOffset int=DATEPART(TZOFFSET,SYSDATETIMEOFFSET());

          SELECT
            (SELECT COUNT(*) FROM dbo.RESERVATION WHERE status='PENDING') pendingBookingReviews,
            (SELECT COUNT(*) FROM dbo.PAYMENT_PROOF WHERE status='SUBMITTED') proofsAwaitingVerification,
            (SELECT COUNT(*) FROM dbo.RESERVATION WHERE status='CONFIRMED' AND event_date>=@today AND event_date<@nextSeven) confirmedEventsNextSevenDays,
            (SELECT COALESCE(SUM(CASE WHEN p.amount_due>p.amount_paid THEN p.amount_due-p.amount_paid ELSE 0 END),0)
             FROM dbo.PAYMENT p JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
             WHERE r.status IN('PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED')) outstandingBalanceTotal,
            (SELECT COUNT(*) FROM dbo.EMAIL_OUTBOX WHERE status='FAILED') failedEmailNotifications,
            CAST(0 AS int) qrAssignmentsWaiting,
            (SELECT COALESCE(SUM(pt.amount),0) FROM dbo.PAYMENT_TRANSACTION pt WHERE pt.payment_date>=@periodStart AND pt.payment_date<@periodEnd) confirmedRevenue,
            (SELECT COALESCE(SUM(pp.claimed_amount),0) FROM dbo.PAYMENT_PROOF pp WHERE pp.status='SUBMITTED' AND pp.created_at>=@periodStart AND pp.created_at<@periodEnd) submittedProofValue,
            (SELECT COALESCE(SUM(CASE WHEN p.amount_due>p.amount_paid THEN p.amount_due-p.amount_paid ELSE 0 END),0)
             FROM dbo.PAYMENT p JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
             WHERE r.event_date<@today AND r.status NOT IN('REJECTED','CANCELLED')) overdueOutstanding,
            (SELECT COALESCE(AVG(CONVERT(decimal(12,2),r.total_amount)),0)
             FROM dbo.RESERVATION r WHERE EXISTS(
               SELECT 1 FROM dbo.BOOKING_STATUS_HISTORY h WHERE h.reservation_id=r.reservation_id
               AND h.next_status='CONFIRMED' AND h.created_at>=@periodStart AND h.created_at<@periodEnd
             )) averageConfirmedBookingValue;

          ;WITH bookingUpdates AS (
            SELECT h.reservation_id,MAX(h.created_at) updatedAt
            FROM dbo.BOOKING_STATUS_HISTORY h GROUP BY h.reservation_id
          ), attention AS (
            SELECT 1 urgencyRank,'PAYMENT_PROOF' type,CONVERT(varchar(20),pp.payment_proof_id) stableId,
              CONCAT('Review proof for ',r.booking_reference) title,CONCAT(c.first_name,' ',c.last_name) detail,
              CONVERT(varchar(10),r.event_date,23) eventDate,pp.updated_at updatedAt
            FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id
            JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id WHERE pp.status='SUBMITTED'
            UNION ALL
            SELECT 2,'BOOKING',CONVERT(varchar(20),r.reservation_id),CONCAT('Review ',r.booking_reference),
              CONCAT(c.first_name,' ',c.last_name),CONVERT(varchar(10),r.event_date,23),COALESCE(bu.updatedAt,r.created_at)
            FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
            LEFT JOIN bookingUpdates bu ON bu.reservation_id=r.reservation_id WHERE r.status='PENDING'
            UNION ALL
            SELECT 3,'OVERDUE_BALANCE',CONVERT(varchar(20),r.reservation_id),CONCAT('Outstanding ',r.booking_reference),
              CONCAT('PHP ',CONVERT(varchar(30),p.amount_due-p.amount_paid)),CONVERT(varchar(10),r.event_date,23),COALESCE(bu.updatedAt,r.created_at)
            FROM dbo.PAYMENT p JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
            LEFT JOIN bookingUpdates bu ON bu.reservation_id=r.reservation_id
            WHERE r.event_date<@today AND p.amount_due>p.amount_paid AND r.status NOT IN('REJECTED','CANCELLED')
            UNION ALL
            SELECT 4,'EMAIL_OUTBOX',CONVERT(varchar(20),notification_id),'Retry failed email',recipient,
              CONVERT(varchar(10),created_at,23),updated_at FROM dbo.EMAIL_OUTBOX WHERE status='FAILED'
          )
          SELECT TOP (10) urgencyRank,type,stableId id,title,detail,eventDate,updatedAt
          FROM attention ORDER BY updatedAt DESC,type,stableId DESC;

          ;WITH activity AS (
            SELECT CONCAT('R-',r.reservation_id) id,r.reservation_id reservationId,'Reservation submitted' title,
              CONCAT(r.booking_reference,' · ',c.first_name,' ',c.last_name) detail,DATEADD(minute,-@serverOffset,r.created_at) updatedAt
            FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
            UNION ALL
            SELECT CONCAT('H-',h.booking_status_history_id) id,r.reservation_id reservationId,
              CASE WHEN h.reason LIKE 'Payment method %' THEN 'Payment method selected'
                WHEN h.previous_status IS NULL THEN 'Reservation submitted'
                WHEN h.next_status='CANCELLED' THEN 'Reservation cancelled'
                ELSE 'Reservation updated' END title,
              CONCAT(r.booking_reference,' · ',c.first_name,' ',c.last_name,' · ',COALESCE(h.reason,h.next_status)) detail,
              h.created_at updatedAt
            FROM dbo.BOOKING_STATUS_HISTORY h JOIN dbo.RESERVATION r ON r.reservation_id=h.reservation_id
            JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
            WHERE h.actor_type='CUSTOMER' AND h.previous_status IS NOT NULL AND h.next_status<>'PAYMENT_SUBMITTED'
            UNION ALL
            SELECT CONCAT('P-',pp.payment_proof_id),r.reservation_id,'Payment proof submitted',
              CONCAT(r.booking_reference,' · ',c.first_name,' ',c.last_name,' · PHP ',CONVERT(varchar(30),pp.claimed_amount)),pp.created_at
            FROM dbo.PAYMENT_PROOF pp JOIN dbo.RESERVATION r ON r.reservation_id=pp.reservation_id
            JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
            UNION ALL
            SELECT CONCAT('A-',a.audit_id),r.reservation_id,'Event time adjusted by admin',
              CONCAT(r.booking_reference,' · ',JSON_VALUE(a.old_values,'$.eventTime'),' → ',JSON_VALUE(a.new_values,'$.eventTime')),DATEADD(minute,-@serverOffset,a.created_at)
            FROM dbo.ADMIN_AUDIT_LOG a JOIN dbo.RESERVATION r ON r.reservation_id=a.entity_id
            WHERE a.entity_type='BOOKING' AND a.action='BOOKING_TIME_UPDATED'
          ) SELECT TOP(20) id,reservationId,title,detail,updatedAt FROM activity ORDER BY updatedAt DESC,id DESC;
        `);
      const sets = (result.recordsets ?? []) as unknown as Record<string, unknown>[][];
      const metrics = sets[0]?.[0] ?? {};
      const attention = (sets[1] ?? []).map(row => ({
        type: String(row['type']), id: String(row['id']), title: String(row['title']),
        detail: String(row['detail'] ?? ''), eventDate: dateValue(row['eventDate']),
        updatedAt: dateValue(row['updatedAt']), urgencyRank: numberValue(row['urgencyRank'])
      }));
      const priority = {
        pendingBookingReviews: numberValue(metrics['pendingBookingReviews']),
        proofsAwaitingVerification: numberValue(metrics['proofsAwaitingVerification']),
        confirmedEventsNextSevenDays: numberValue(metrics['confirmedEventsNextSevenDays']),
        outstandingBalanceTotal: numberValue(metrics['outstandingBalanceTotal']),
        failedEmailNotifications: numberValue(metrics['failedEmailNotifications']),
        qrAssignmentsWaiting: numberValue(metrics['qrAssignmentsWaiting'])
      };
      return {
        period: period.key,
        priority,
        ledger: {
          confirmedRevenue: numberValue(metrics['confirmedRevenue']),
          submittedProofValue: numberValue(metrics['submittedProofValue']),
          overdueOutstanding: numberValue(metrics['overdueOutstanding']),
          averageConfirmedBookingValue: numberValue(metrics['averageConfirmedBookingValue'])
        },
        actionQueues: [
          { key: 'pendingBookings', count: priority.pendingBookingReviews, href: '/admin/bookings?status=PENDING' },
          { key: 'submittedProofs', count: priority.proofsAwaitingVerification, href: '/admin/payments?status=SUBMITTED' },
          { key: 'upcomingEvents', count: priority.confirmedEventsNextSevenDays, href: '/admin/calendar?range=7d' },
          { key: 'failedEmails', count: priority.failedEmailNotifications, href: '/admin/email-outbox?status=FAILED' }
        ],
        attention,
        recentActivity: (sets[2] ?? []).map(row => ({ id: String(row['id']), reservationId: numberValue(row['reservationId']),
          title: String(row['title']), detail: row['title'] === 'Event time adjusted by admin' ? formatEventTimeChange(String(row['detail'] ?? '')) : String(row['detail'] ?? ''), updatedAt: dateValue(row['updatedAt']) }))
      };
    },

    async customerBookings(customerId: number, query: CustomerHistoryQuery) {
      const result = await (await deps.readRequest())
        .replaceInput('customerId', sql.Int, customerId)
        .replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
        .replaceInput('pageSize', sql.Int, query.pageSize)
        .query<Record<string, unknown>>(`SELECT r.reservation_id id,r.booking_reference reference,e.event_type eventType,
          CONVERT(varchar(10),r.event_date,23) eventDate,r.guest_count guestCount,r.total_amount total,r.status,
          COALESCE(p.amount_paid,0) amountPaid,COALESCE(p.amount_due-r.total_amount,0) paymentDifference,
          CASE WHEN p.amount_due IS NULL THEN r.total_amount ELSE CASE WHEN p.amount_due>p.amount_paid THEN p.amount_due-p.amount_paid ELSE 0 END END outstandingBalance,
          i.invoice_id invoiceId,i.invoice_number invoiceNumber,i.status invoiceStatus,COUNT(*) OVER() total_count
          FROM dbo.RESERVATION r JOIN dbo.EVENT e ON e.event_id=r.event_id
          LEFT JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id LEFT JOIN dbo.INVOICE i ON i.reservation_id=r.reservation_id
          WHERE r.customer_id=@customerId ORDER BY r.created_at DESC,r.reservation_id DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
      return paged(result.recordset, query);
    },

    async customerPayments(customerId: number, query: CustomerHistoryQuery) {
      const result = await (await deps.readRequest())
        .replaceInput('customerId', sql.Int, customerId)
        .replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
        .replaceInput('pageSize', sql.Int, query.pageSize)
        .query<Record<string, unknown>>(`SELECT CONVERT(varchar(20),pt.payment_transaction_id) id,r.reservation_id bookingId,
          r.booking_reference bookingReference,pt.amount,pt.payment_method paymentMethod,pt.transaction_ref reference,
          pt.payment_date paymentDate,${bankSnapshotColumns('pt')},COUNT(*) OVER() total_count
          FROM dbo.PAYMENT_TRANSACTION pt JOIN dbo.PAYMENT p ON p.payment_id=pt.payment_id
          JOIN dbo.RESERVATION r ON r.reservation_id=p.reservation_id
          WHERE r.customer_id=@customerId ORDER BY pt.payment_date DESC,pt.payment_transaction_id DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
      return paged(result.recordset.map(row => ({ ...row, id: String(row['id']), paymentDate: dateValue(row['paymentDate']) })), query);
    },

    async emailOutbox(query: EmailOutboxQuery) {
      const result = await (await deps.readRequest())
        .replaceInput('search', sql.NVarChar(200), query.search)
        .replaceInput('status', sql.NVarChar(20), query.status)
        .replaceInput('templateKey', sql.NVarChar(80), query.templateKey)
        .replaceInput('relatedEntityType', sql.NVarChar(50), query.relatedEntityType)
        .replaceInput('relatedEntityId', sql.BigInt, query.relatedEntityId || null)
        .replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
        .replaceInput('pageSize', sql.Int, query.pageSize)
        .query<Record<string, unknown>>(`SELECT CONVERT(varchar(20),notification_id) id,recipient,template_key templateKey,payload,
          related_entity_type relatedEntityType,CONVERT(varchar(20),related_entity_id) relatedEntityId,status,
          attempt_count attemptCount,next_attempt_at nextAttemptAt,last_error lastError,created_at createdAt,sent_at sentAt,
          updated_at updatedAt,COUNT(*) OVER() total_count FROM dbo.EMAIL_OUTBOX
          WHERE (@search='' OR recipient LIKE '%'+@search+'%') AND (@status='' OR status=@status)
          AND (@templateKey='' OR template_key=@templateKey) AND (@relatedEntityType='' OR related_entity_type=@relatedEntityType)
          AND (@relatedEntityId IS NULL OR related_entity_id=@relatedEntityId)
          ORDER BY created_at DESC,notification_id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
      return paged(result.recordset.map(row => ({ ...row, id: String(row['id']),
        relatedEntityId: row['relatedEntityId'] == null ? undefined : String(row['relatedEntityId']),
        payload: ['PASSWORD_RESET_REQUESTED', 'EMAIL_VERIFICATION_CODE'].includes(String(row['templateKey'])) ? { sensitive: true } : parseJsonObject(row['payload']),
        createdAt: dateValue(row['createdAt']), updatedAt: dateValue(row['updatedAt']),
        nextAttemptAt: row['nextAttemptAt'] == null ? undefined : dateValue(row['nextAttemptAt']),
        sentAt: row['sentAt'] == null ? undefined : dateValue(row['sentAt']) })), query);
    },

    async retryEmail(adminId: number, outboxId: string): Promise<boolean> {
      return deps.transaction(async request => {
        const result = await request
          .replaceInput('outboxId', sql.BigInt, outboxId)
          .query(`UPDATE dbo.EMAIL_OUTBOX SET status='PENDING',attempt_count=0,next_attempt_at=SYSUTCDATETIME(),
            last_error=NULL,sent_at=NULL,updated_at=SYSUTCDATETIME()
            WHERE notification_id=@outboxId AND status='FAILED'`);
        if ((result.rowsAffected[0] ?? 0) !== 1) return false;
        await writeAdminAudit({ adminId, action: 'EMAIL_OUTBOX_RETRIED', entityType: 'EMAIL_OUTBOX', entityId: adminId,
          newValues: { notificationId: outboxId } }, request);
        return true;
      });
    },

    async auditLog(query: AuditLogQuery) {
      const result = await (await deps.readRequest())
        .replaceInput('adminId', sql.Int, query.adminId ?? null)
        .replaceInput('action', sql.NVarChar(80), query.action)
        .replaceInput('entityType', sql.NVarChar(50), query.entityType)
        .replaceInput('entityId', sql.Int, query.entityId ?? null)
        .replaceInput('dateFrom', sql.VarChar(10), query.dateFrom)
        .replaceInput('dateTo', sql.VarChar(10), query.dateTo)
        .replaceInput('offset', sql.Int, (query.page - 1) * query.pageSize)
        .replaceInput('pageSize', sql.Int, query.pageSize)
        .query<Record<string, unknown>>(`SELECT CONVERT(varchar(20),a.audit_id) id,a.admin_id adminId,
          ad.username adminUsername,a.action,a.entity_type entityType,a.entity_id entityId,a.old_values oldValues,
          a.new_values newValues,a.created_at createdAt,COUNT(*) OVER() total_count
          FROM dbo.ADMIN_AUDIT_LOG a JOIN dbo.ADMIN ad ON ad.admin_id=a.admin_id
          WHERE (@adminId IS NULL OR a.admin_id=@adminId) AND (@action='' OR a.action=@action)
          AND (@entityType='' OR a.entity_type=@entityType) AND (@entityId IS NULL OR a.entity_id=@entityId)
          AND (@dateFrom='' OR a.created_at>=CONVERT(date,@dateFrom))
          AND (@dateTo='' OR a.created_at<DATEADD(day,1,CONVERT(date,@dateTo)))
          ORDER BY a.created_at DESC,a.audit_id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`);
      return paged(result.recordset.map(row => ({ ...row, id: String(row['id']), oldValues: parseJsonObject(row['oldValues']),
        newValues: parseJsonObject(row['newValues']), createdAt: dateValue(row['createdAt']) })), query);
    }
  };
}

export const adminOperationsRepository = createAdminOperationsRepository({
  readRequest: async () => (await getDbPool()).request(),
  transaction: operationsTransaction
});
