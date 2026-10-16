import type {NextFunction,Request,Response} from 'express';import {adminService} from '../services/admin.service.js';import type {AddOnInput,BookingStatus,PackageInput,PageQuery,PaymentInput} from '../types/admin.types.js';import {AppError} from '../utils/app-error.js';
import { paymentVerificationService } from '../services/payment-verification.service.js';
import { normalizePackageInput } from '../services/package-admin-input.service.js';
import { customEventAdminService } from '../services/custom-event-admin.service.js';

function proofId(request: Request): number {
 const value = request.params['id'];
 if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new AppError(400, 'Invalid identifier.');
 return Number(value);
}

function proofBody(body: unknown): Record<string, unknown> {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Proof review input is invalid.');
 return body as Record<string, unknown>;
}
const id=(req:Request)=>{const raw=req.params['id'];if(typeof raw!=='string'||!/^[1-9]\d*$/.test(raw))throw new AppError(400,'Invalid identifier.');const value=Number(raw);if(!Number.isSafeInteger(value)||value>2_147_483_647)throw new AppError(400,'Invalid identifier.');return value;};
const query=(req:Request):PageQuery=>({page:Math.max(Number(req.query['page'])||1,1),pageSize:Math.min(Math.max(Number(req.query['pageSize'])||20,1),100),search:String(req.query['search']??'').trim(),status:String(req.query['status']??'').toUpperCase(),eventType:String(req.query['eventType']??''),date:String(req.query['date']??'')});
export function parseActiveFlag(value: unknown): boolean {
 if(typeof value!=='boolean')throw new AppError(400,'Active status must be true or false.');
 return value;
}
const addOnInput=(b:Record<string,unknown>):AddOnInput=>({name:String(b['name']??'').trim(),description:String(b['description']??'').trim(),price:Number(b['price']),isActive:parseActiveFlag(b['isActive'])});
const bookingStatuses:readonly BookingStatus[]=['PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED','COMPLETED','REJECTED','CANCELLED'];
function statusInput(body:unknown):{status:BookingStatus;reason?:string;capacityConfirmed?:boolean}{
 const value=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const status=typeof value['status']==='string'?value['status'].trim().toUpperCase():'';
 if(!bookingStatuses.includes(status as BookingStatus))throw new AppError(400,'Invalid booking status.');
 if(status==='PAYMENT_SUBMITTED'||status==='PAYMENT_VERIFIED')throw new AppError(409,'Payment status changes require the payment proof workflow.');
 if(value['reason']!==undefined&&typeof value['reason']!=='string')throw new AppError(400,'Invalid booking reason.');
 const reason=(value['reason'] as string|undefined)?.trim();
 if((reason?.length??0)>1000)throw new AppError(400,'Booking reason is too long.');
 if((status==='REJECTED'||status==='CANCELLED')&&!reason)throw new AppError(400,'A reason is required for rejection or cancellation.');
 if(value['capacityConfirmed']!==undefined&&typeof value['capacityConfirmed']!=='boolean')throw new AppError(400,'Capacity confirmation must be true or false.');
 return{status:status as BookingStatus,reason,capacityConfirmed:value['capacityConfirmed'] as boolean|undefined};
}
export const adminController={
 customEvents:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await customEventAdminService.list(q.query)});}catch(e){n(e);}},
 customEvent:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await customEventAdminService.detail(id(q))});}catch(e){n(e);}},
 sendCustomQuote:async(q:Request,s:Response,n:NextFunction)=>{try{s.status(201).json({success:true,data:await customEventAdminService.sendQuote(q.admin!.id,id(q),q.body)});}catch(e){n(e);}},
 requestCustomClarification:async(q:Request,s:Response,n:NextFunction)=>{try{await customEventAdminService.requestClarification(q.admin!.id,id(q),q.body);s.json({success:true,message:'Clarification requested.'});}catch(e){n(e);}},
 rejectCustomEvent:async(q:Request,s:Response,n:NextFunction)=>{try{await customEventAdminService.reject(q.admin!.id,id(q),q.body);s.json({success:true,message:'Custom event request rejected.'});}catch(e){n(e);}},
 paymentProofs: async (q: Request, s: Response, n: NextFunction) => {
  try { s.json({ success: true, data: await paymentVerificationService.listPendingProofs(q.query) }); } catch (e) { n(e); }
 },
 paymentProof: async (q: Request, s: Response, n: NextFunction) => {
  try { s.json({ success: true, data: await paymentVerificationService.getProofForReview(proofId(q)) }); } catch (e) { n(e); }
 },
 verifyPaymentProof: async (q: Request, s: Response, n: NextFunction) => {
  try {
   const body = proofBody(q.body);
   s.json({ success: true, data: await paymentVerificationService.verifyProof(q.admin!.id, proofId(q), body['verifiedAmount'], body['reason']) });
  } catch (e) { n(e); }
 },
 rejectPaymentProof: async (q: Request, s: Response, n: NextFunction) => {
  try {
   const body = proofBody(q.body);
   s.json({ success: true, data: await paymentVerificationService.rejectProof(q.admin!.id, proofId(q), body['reason']) });
  } catch (e) { n(e); }
 },
 dashboard:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.dashboard(q.query['period'])});}catch(e){n(e);}},
 customerBookings:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customerBookings(id(q),q.query)});}catch(e){n(e);}},
 customerPayments:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customerPayments(id(q),q.query)});}catch(e){n(e);}},
 emailOutbox:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.emailOutbox(q.query)});}catch(e){n(e);}},
 retryEmail:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.retryEmail(q.admin!.id,q.params['id']);s.json({success:true,message:'Notification queued for retry.'});}catch(e){n(e);}},
 emailPreview:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.emailPreview(q.params['id'])});}catch(e){n(e);}},
 auditLog:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.auditLog(q.query)});}catch(e){n(e);}},
 bookings:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.bookings(query(q))});}catch(e){n(e);}},booking:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.booking(id(q))});}catch(e){n(e);}},status:async(q:Request,s:Response,n:NextFunction)=>{try{const {status,reason,capacityConfirmed}=statusInput(q.body);await adminService.updateStatus(q.admin!.id,id(q),status,reason,capacityConfirmed);s.json({success:true,message:'Booking status updated.'});}catch(e){n(e);}},customers:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customers(query(q))});}catch(e){n(e);}},customer:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customer(id(q))});}catch(e){n(e);}},packages:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.packages()});}catch(e){n(e);}},events:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.eventTypes()});}catch(e){n(e);}},createPackage:async(q:Request,s:Response,n:NextFunction)=>{try{s.status(201).json({success:true,data:{id:await adminService.createPackage(q.admin!.id,normalizePackageInput(q.body))}});}catch(e){n(e);}},updatePackage:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.updatePackage(q.admin!.id,id(q),normalizePackageInput(q.body));s.json({success:true,message:'Package updated.'});}catch(e){n(e);}},addOns:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.addOns()});}catch(e){n(e);}},createAddOn:async(q:Request,s:Response,n:NextFunction)=>{try{s.status(201).json({success:true,data:{id:await adminService.createAddOn(q.admin!.id,addOnInput(q.body))}});}catch(e){n(e);}},updateAddOn:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.updateAddOn(q.admin!.id,id(q),addOnInput(q.body));s.json({success:true,message:'Add-on updated.'});}catch(e){n(e);}},payments:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.payments(query(q))});}catch(e){n(e);}},recordPayment:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.recordPayment(q.admin!.id,{reservationId:Number(q.body?.reservationId),amount:Number(q.body?.amount),method:String(q.body?.method??'') as PaymentInput['method'],reference:q.body?.reference?String(q.body.reference):undefined,paymentDate:String(q.body?.paymentDate??'')});s.status(201).json({success:true,message:'Payment recorded.'});}catch(e){n(e);}}
};
