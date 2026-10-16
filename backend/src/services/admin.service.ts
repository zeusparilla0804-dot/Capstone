import * as repo from '../repositories/admin.repository.js';import type {AddOnInput,AdminDashboard,AuditLogQuery,CustomerHistoryQuery,EmailOutboxQuery,BookingStatus,PackageInput,PageQuery,PageResult,PaymentInput,ReportingPeriod} from '../types/admin.types.js';import {AppError} from '../utils/app-error.js';import {finiteMoney,isoDate,text} from '../utils/validation.js';
import {writeAdminAudit} from '../repositories/audit.repository.js';
import {transitionBooking} from './booking-status.service.js';
import {renderEmailPreview} from './notification.service.js';
import { normalizePackageInput } from './package-admin-input.service.js';

interface AdminOperationsDependencies {
 dashboard(period:ReportingPeriod):Promise<AdminDashboard>;
 customerBookings(customerId:number,query:CustomerHistoryQuery):Promise<PageResult<unknown>>;
 customerPayments(customerId:number,query:CustomerHistoryQuery):Promise<PageResult<unknown>>;
 emailOutbox(query:EmailOutboxQuery):Promise<PageResult<unknown>>;
 retryEmail(adminId:number,outboxId:string):Promise<boolean>;
 auditLog(query:AuditLogQuery):Promise<PageResult<unknown>>;
 renderEmailPreview(outboxId:string):Promise<unknown>;
}

const sqlIntMax=2_147_483_647;
const sqlBigIntMax=9_223_372_036_854_775_807n;

function inputObject(raw:unknown):Record<string,unknown>{return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};}
function oneString(value:unknown,name:string,max:number):string{
 if(value===undefined||value===null)return'';
 if(typeof value!=='string')throw new AppError(400,`${name} is invalid.`);
 const result=value.trim();if(result.length>max)throw new AppError(400,`${name} is invalid.`);return result;
}
function optionalPositiveInt(value:unknown,name:string):number|undefined{
 if(value===undefined||value===null||value==='')return undefined;
 if(typeof value!=='string'&&typeof value!=='number')throw new AppError(400,`${name} is invalid.`);
 const raw=String(value);if(!/^[1-9]\d*$/.test(raw))throw new AppError(400,`${name} is invalid.`);
 const parsed=Number(raw);if(!Number.isSafeInteger(parsed)||parsed>sqlIntMax)throw new AppError(400,`${name} is invalid.`);return parsed;
}
function pageQuery(raw:unknown):CustomerHistoryQuery{
 const value=inputObject(raw);const page=optionalPositiveInt(value['page'],'Page')??1;const pageSize=optionalPositiveInt(value['pageSize'],'Page size')??20;
 if(pageSize>100||(page-1)*pageSize>sqlIntMax)throw new AppError(400,'Pagination is invalid.');return{page,pageSize};
}
function periodRange(raw:unknown,now:Date):ReportingPeriod{
 const current=`${now.getUTCFullYear().toString().padStart(4,'0')}-${(now.getUTCMonth()+1).toString().padStart(2,'0')}`;
 const key=raw===undefined||raw===null||raw===''?current:oneString(raw,'Reporting period',7);
 const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);if(!match)throw new AppError(400,'Reporting period must use YYYY-MM.');
 const year=Number(match[1]);const month=Number(match[2]);if(year<1||year>9999)throw new AppError(400,'Reporting period is invalid.');
 const start=new Date(0);start.setUTCFullYear(year,month-1,1);start.setUTCHours(0,0,0,0);
 const end=new Date(0);end.setUTCFullYear(month===12?year+1:year,month===12?0:month,1);end.setUTCHours(0,0,0,0);
 return{key,start,end};
}
function bigintIdentifier(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>19||!/^[1-9]\d*$/.test(raw)||BigInt(raw)>sqlBigIntMax)throw new AppError(400,'Invalid notification identifier.');return raw;
}
function adminDate(raw:unknown,name:string):string{
 if(raw===undefined||raw===null||raw==='')return'';
 if(typeof raw!=='string')throw new AppError(400,`${name} is invalid.`);
 return isoDate(raw,name);
}

export function createAdminOperationsService(deps:AdminOperationsDependencies,clock:()=>Date=()=>new Date()){
 return{
  dashboard:(period?:unknown)=>deps.dashboard(periodRange(period,clock())),
  customerBookings(customerId:number,raw:unknown){validCustomerId(customerId);return deps.customerBookings(customerId,pageQuery(raw));},
  customerPayments(customerId:number,raw:unknown){validCustomerId(customerId);return deps.customerPayments(customerId,pageQuery(raw));},
  emailOutbox(raw:unknown){
   const value=inputObject(raw);const page=pageQuery(value);const status=oneString(value['status'],'Outbox status',20).toUpperCase();
   if(!['','PENDING','PROCESSING','SENT','FAILED'].includes(status))throw new AppError(400,'Outbox status is invalid.');
   const relatedEntityId=value['relatedEntityId']===undefined||value['relatedEntityId']===''?'':bigintIdentifier(value['relatedEntityId']);
   return deps.emailOutbox({...page,search:oneString(value['search'],'Search',200),status:status as EmailOutboxQuery['status'],
    templateKey:oneString(value['templateKey'],'Template key',80),relatedEntityType:oneString(value['relatedEntityType'],'Related entity type',50),relatedEntityId});
  },
  async retryEmail(adminId:number,outboxId:unknown){validCustomerId(adminId);if(!await deps.retryEmail(adminId,bigintIdentifier(outboxId)))throw new AppError(409,'Only failed notifications can be retried.');},
  emailPreview:(outboxId:unknown)=>deps.renderEmailPreview(bigintIdentifier(outboxId)),
  auditLog(raw:unknown){
   const value=inputObject(raw);const page=pageQuery(value);const dateFrom=adminDate(value['dateFrom'],'Start date');const dateTo=adminDate(value['dateTo'],'End date');
   if(dateFrom&&dateTo&&dateFrom>dateTo)throw new AppError(400,'Audit date range is invalid.');
   return deps.auditLog({...page,adminId:optionalPositiveInt(value['adminId'],'Admin identifier'),action:oneString(value['action'],'Audit action',80),
    entityType:oneString(value['entityType'],'Entity type',50),entityId:optionalPositiveInt(value['entityId'],'Entity identifier'),dateFrom,dateTo});
  }
 };
}
function validCustomerId(value:number){if(!Number.isSafeInteger(value)||value<1||value>sqlIntMax)throw new AppError(400,'Invalid identifier.');}

const adminOperationsService=createAdminOperationsService({...repo.adminOperationsRepository,renderEmailPreview});

export const adminService={dashboard:adminOperationsService.dashboard,bookings:repo.bookings,customers:repo.customers,packages:repo.packages,eventTypes:repo.eventTypes,addOns:repo.addOns,payments:repo.payments,
 customerBookings:adminOperationsService.customerBookings,customerPayments:adminOperationsService.customerPayments,emailOutbox:adminOperationsService.emailOutbox,
 retryEmail:adminOperationsService.retryEmail,emailPreview:adminOperationsService.emailPreview,auditLog:adminOperationsService.auditLog,
 async booking(id:number){const item=await repo.booking(id);if(!item)throw new AppError(404,'Booking not found.');return item;},
 async customer(id:number){const item=await repo.customer(id);if(!item)throw new AppError(404,'Customer not found.');return item;},
 async updateStatus(adminId:number,id:number,status:BookingStatus,reason?:string,capacityConfirmed?:boolean){if(status==='PAYMENT_SUBMITTED'||status==='PAYMENT_VERIFIED')throw new AppError(409,'Payment status changes require the payment proof workflow.');await transitionBooking({reservationId:id,nextStatus:status,actor:{type:'ADMIN',id:adminId},reason,capacityConfirmed,mode:'GENERIC_ADMIN'});},
 async createPackage(adminId:number,v:PackageInput){const value=normalizePackageInput(v);const id=await repo.createPackage(value);await writeAdminAudit({adminId,action:'PACKAGE_CREATED',entityType:'PACKAGE',entityId:id,newValues:auditPackage(value)});return id;},async updatePackage(adminId:number,id:number,v:PackageInput){const value=normalizePackageInput(v);if(!(await repo.updatePackage(id,value)))throw new AppError(404,'Package not found.');await writeAdminAudit({adminId,action:'PACKAGE_UPDATED',entityType:'PACKAGE',entityId:id,newValues:auditPackage(value)});},
 async createAddOn(adminId:number,v:AddOnInput){validateAddOn(v);const id=await repo.createAddOn(v);await writeAdminAudit({adminId,action:'ADD_ON_CREATED',entityType:'ADD_ON',entityId:id,newValues:auditAddOn(v)});return id;},async updateAddOn(adminId:number,id:number,v:AddOnInput){validateAddOn(v);if(!(await repo.updateAddOn(id,v)))throw new AppError(404,'Add-on not found.');await writeAdminAudit({adminId,action:'ADD_ON_UPDATED',entityType:'ADD_ON',entityId:id,newValues:auditAddOn(v)});},
 async recordPayment(adminId:number,v:PaymentInput){if(!Number.isSafeInteger(v.reservationId)||v.reservationId<1||!['CASH','BANK_TRANSFER','E-WALLET'].includes(v.method))throw new AppError(400,'Payment details are invalid.');v.amount=finiteMoney(v.amount,'Payment amount');v.paymentDate=isoDate(v.paymentDate,'Payment date');if(v.reference)v.reference=text(v.reference,'Payment reference',{max:150});try{if(!(await repo.recordPayment(adminId,v)))throw new AppError(404,'Booking payment record not found.');}catch(e){if(e instanceof Error&&e.message==='OVERPAYMENT')throw new AppError(409,'Payment exceeds the outstanding balance.');if(e instanceof Error&&e.message==='PAYMENT_BOOKING_STATUS')throw new AppError(409,'Payments can only be recorded for an active approved booking.');if(isDuplicateKey(e))throw new AppError(409,'This payment reference has already been recorded.');throw e;}}
};
function validateAddOn(v:AddOnInput){v.name=text(v.name,'Add-on name',{max:150});if(v.description.length>1000)throw new AppError(400,'Description is too long.');v.price=finiteMoney(v.price,'Add-on price',true);}
function isDuplicateKey(error:unknown){return typeof error==='object'&&error!==null&&('number' in error)&&[2601,2627].includes(Number((error as {number:unknown}).number));}
function auditPackage(v:PackageInput){return{eventId:v.eventId,name:v.name,pricingType:v.pricingType,pricePerGuest:v.pricePerGuest,basePrice:v.basePrice,includedGuests:v.includedGuests,excessGuestPrice:v.excessGuestPrice,minGuests:v.minGuests,maxGuests:v.maxGuests,isActive:v.isActive};}
function auditAddOn(v:AddOnInput){return{name:v.name,price:v.price,isActive:v.isActive};}
