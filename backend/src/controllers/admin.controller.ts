import type {NextFunction,Request,Response} from 'express';import {adminService} from '../services/admin.service.js';import type {AddOnInput,BookingStatus,PackageInput,PageQuery,PaymentInput} from '../types/admin.types.js';import {AppError} from '../utils/app-error.js';
import { paymentVerificationService } from '../services/payment-verification.service.js';

function proofId(request: Request): number {
 const value = request.params['id'];
 if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new AppError(400, 'Invalid identifier.');
 return Number(value);
}

function proofBody(body: unknown): Record<string, unknown> {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Proof review input is invalid.');
 return body as Record<string, unknown>;
}
const id=(req:Request)=>{const value=Number(req.params['id']);if(!Number.isInteger(value)||value<1)throw new AppError(400,'Invalid identifier.');return value;};
const query=(req:Request):PageQuery=>({page:Math.max(Number(req.query['page'])||1,1),pageSize:Math.min(Math.max(Number(req.query['pageSize'])||20,1),100),search:String(req.query['search']??'').trim(),status:String(req.query['status']??'').toUpperCase(),eventType:String(req.query['eventType']??''),date:String(req.query['date']??'')});
const packageInput=(b:Record<string,unknown>):PackageInput=>({eventId:Number(b['eventId']),name:String(b['name']??'').trim(),description:String(b['description']??'').trim(),pricePerGuest:Number(b['pricePerGuest']),minGuests:Number(b['minGuests']),maxGuests:Number(b['maxGuests']),isActive:Boolean(b['isActive'])});
const addOnInput=(b:Record<string,unknown>):AddOnInput=>({name:String(b['name']??'').trim(),description:String(b['description']??'').trim(),price:Number(b['price']),isActive:Boolean(b['isActive'])});
const bookingStatuses:readonly BookingStatus[]=['PENDING','APPROVED','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED','COMPLETED','REJECTED','CANCELLED'];
function statusInput(body:unknown):{status:BookingStatus;reason?:string}{
 const value=body&&typeof body==='object'?body as Record<string,unknown>:{};
 const status=typeof value['status']==='string'?value['status'].trim().toUpperCase():'';
 if(!bookingStatuses.includes(status as BookingStatus))throw new AppError(400,'Invalid booking status.');
 if(status==='PAYMENT_SUBMITTED'||status==='PAYMENT_VERIFIED')throw new AppError(409,'Payment status changes require the payment proof workflow.');
 if(value['reason']!==undefined&&typeof value['reason']!=='string')throw new AppError(400,'Invalid booking reason.');
 const reason=(value['reason'] as string|undefined)?.trim();
 if((reason?.length??0)>1000)throw new AppError(400,'Booking reason is too long.');
 if((status==='REJECTED'||status==='CANCELLED')&&!reason)throw new AppError(400,'A reason is required for rejection or cancellation.');
 return{status:status as BookingStatus,reason};
}
export const adminController={
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
 dashboard:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.dashboard()});}catch(e){n(e);}},bookings:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.bookings(query(q))});}catch(e){n(e);}},booking:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.booking(id(q))});}catch(e){n(e);}},status:async(q:Request,s:Response,n:NextFunction)=>{try{const {status,reason}=statusInput(q.body);await adminService.updateStatus(q.admin!.id,id(q),status,reason);s.json({success:true,message:'Booking status updated.'});}catch(e){n(e);}},customers:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customers(query(q))});}catch(e){n(e);}},customer:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.customer(id(q))});}catch(e){n(e);}},packages:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.packages()});}catch(e){n(e);}},events:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.eventTypes()});}catch(e){n(e);}},createPackage:async(q:Request,s:Response,n:NextFunction)=>{try{s.status(201).json({success:true,data:{id:await adminService.createPackage(q.admin!.id,packageInput(q.body))}});}catch(e){n(e);}},updatePackage:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.updatePackage(q.admin!.id,id(q),packageInput(q.body));s.json({success:true,message:'Package updated.'});}catch(e){n(e);}},addOns:async(_q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.addOns()});}catch(e){n(e);}},createAddOn:async(q:Request,s:Response,n:NextFunction)=>{try{s.status(201).json({success:true,data:{id:await adminService.createAddOn(q.admin!.id,addOnInput(q.body))}});}catch(e){n(e);}},updateAddOn:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.updateAddOn(q.admin!.id,id(q),addOnInput(q.body));s.json({success:true,message:'Add-on updated.'});}catch(e){n(e);}},payments:async(q:Request,s:Response,n:NextFunction)=>{try{s.json({success:true,data:await adminService.payments(query(q))});}catch(e){n(e);}},recordPayment:async(q:Request,s:Response,n:NextFunction)=>{try{await adminService.recordPayment(q.admin!.id,{reservationId:Number(q.body?.reservationId),amount:Number(q.body?.amount),method:String(q.body?.method??'') as PaymentInput['method'],reference:q.body?.reference?String(q.body.reference):undefined,paymentDate:String(q.body?.paymentDate??'')});s.status(201).json({success:true,message:'Payment recorded.'});}catch(e){n(e);}}
};
