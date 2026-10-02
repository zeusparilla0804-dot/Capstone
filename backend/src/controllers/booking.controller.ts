import type { NextFunction,Request,Response } from 'express'; import { bookingService } from '../services/booking.service.js'; import { AppError } from '../utils/app-error.js'; import type { CreateBookingDto } from '../types/domain.types.js';
import { identifier, isoDate, text, time24 } from '../utils/validation.js';

export function parseBooking(body: Record<string, unknown>): CreateBookingDto {
  const guestCount = Number(body['guestCount']);
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 10_000) throw new AppError(400, 'Guest count is invalid.');
  if (body['addOnIds'] !== undefined && !Array.isArray(body['addOnIds'])) throw new AppError(400, 'Add-ons must be an array.');
  const addOnIds = (body['addOnIds'] as unknown[] | undefined ?? []).map((value) => identifier(value, 'Add-on identifier'));
  if (addOnIds.length > 50 || new Set(addOnIds).size !== addOnIds.length) throw new AppError(400, 'Add-ons contain duplicate or excessive entries.');
  const paymentMethod = body['paymentMethod'] === undefined ? undefined : text(body['paymentMethod'], 'Payment method', { max: 30 });
  if (paymentMethod && !['cash', 'bank-transfer', 'e-wallet'].includes(paymentMethod)) throw new AppError(400, 'Payment method is invalid.');
  return {
    eventType: text(body['eventType'], 'Event type', { max: 100 }),
    eventDate: isoDate(body['eventDate'], 'Event date', true),
    eventTime: time24(body['eventTime']),
    venue: text(body['venue'], 'Venue', { max: 500 }),
    guestCount,
    packageId: identifier(body['packageId'], 'Package identifier'),
    addOnIds,
    paymentMethod
  };
}
export async function create(req:Request,res:Response,next:NextFunction){try{res.status(201).json({success:true,data:await bookingService.create(req.customer!.id,parseBooking(req.body))});}catch(e){next(e);}}
export async function mine(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.list(req.customer!.id)});}catch(e){next(e);}}
export async function one(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.byId(req.customer!.id,identifier(req.params['id']))});}catch(e){next(e);}}
export async function dashboard(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.dashboard(req.customer!.id)});}catch(e){next(e);}}
export async function cancel(req:Request,res:Response,next:NextFunction){try{const reason=text(req.body?.reason,'Cancellation reason',{max:1000});await bookingService.cancel(req.customer!.id,identifier(req.params['id']),reason);res.status(204).send();}catch(e){next(e);}}
