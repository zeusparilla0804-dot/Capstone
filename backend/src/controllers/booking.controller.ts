import type { NextFunction,Request,Response } from 'express'; import { bookingService } from '../services/booking.service.js'; import { AppError } from '../utils/app-error.js'; import type { CreateBookingDto, UpdatePendingBookingDto } from '../types/domain.types.js';
import { identifier, isoDate, text, time24 } from '../utils/validation.js';
import { assertCustomerBookingDate, parseBookingSubmissionKey } from '../services/booking-submission-policy.js';
import { assertCashPaymentWindow } from '../services/cash-payment-policy.js';

function customerEventDate(value: unknown): string {
  const date = isoDate(value, 'Event date');
  assertCustomerBookingDate(date);
  return date;
}

export function parseBooking(body: Record<string, unknown>, validateTiming = true): CreateBookingDto {
  const guestCount = Number(body['guestCount']);
  if (guestCount > 1500) throw new AppError(400, 'Maximum of 1,500 guests only.');
  if (!Number.isSafeInteger(guestCount) || guestCount < 1) throw new AppError(400, 'Guest count must be a whole number from 1 to 1,500.');
  if (body['addOnIds'] !== undefined && !Array.isArray(body['addOnIds'])) throw new AppError(400, 'Add-ons must be an array.');
  const addOnIds = (body['addOnIds'] as unknown[] | undefined ?? []).map((value) => identifier(value, 'Add-on identifier'));
  if (addOnIds.length > 50 || new Set(addOnIds).size !== addOnIds.length) throw new AppError(400, 'Add-ons contain duplicate or excessive entries.');
  const rawQuantities = body['addOnQuantities'];
  let addOnQuantities: Record<string, number> | undefined;
  if (rawQuantities !== undefined) {
    if (!rawQuantities || typeof rawQuantities !== 'object' || Array.isArray(rawQuantities)) throw new AppError(400, 'Add-on quantities are invalid.');
    const entries = Object.entries(rawQuantities);
    if (entries.some(([id, quantity]) => !addOnIds.some(selected => String(selected) === id)
      || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)) {
      throw new AppError(400, 'Add-on quantities must be positive whole numbers for selected add-ons.');
    }
    addOnQuantities = Object.fromEntries(entries) as Record<string, number>;
  }
  const paymentMethod = body['paymentMethod'] === undefined ? undefined : text(body['paymentMethod'], 'Payment method', { max: 30 });
  if (paymentMethod && !['cash', 'bank-transfer', 'e-wallet'].includes(paymentMethod)) throw new AppError(400, 'Payment method is invalid.');
  const eventDate = validateTiming ? customerEventDate(body['eventDate']) : isoDate(body['eventDate'], 'Event date');
  if (validateTiming && paymentMethod === 'cash') assertCashPaymentWindow(eventDate, guestCount);
  const rawSpecialRequest = body['specialRequest'];
  const specialRequest = rawSpecialRequest === undefined || rawSpecialRequest === null || rawSpecialRequest === ''
    ? undefined
    : text(rawSpecialRequest, 'Special request', { max: 2_000 });
  return {
    eventType: text(body['eventType'], 'Event type', { max: 100 }),
    eventDate,
    eventTime: time24(body['eventTime']),
    venue: text(body['venue'], 'Venue', { max: 500 }),
    guestCount,
    packageId: identifier(body['packageId'], 'Package identifier'),
    addOnIds,
    ...(addOnQuantities === undefined ? {} : { addOnQuantities }),
    paymentMethod,
    specialRequest,
  };
}
export function parsePendingBookingUpdate(body: Record<string, unknown>): UpdatePendingBookingDto {
  return parseBooking(body);
}
export function parseAvailabilityQuery(query: Record<string, unknown>): { date: string; guestCount: number; reservationId?: number } {
  const date = customerEventDate(query['date']);
  const rawGuestCount = query['guestCount'];
  if (typeof rawGuestCount !== 'string' || !/^[1-9]\d*$/.test(rawGuestCount)) {
    throw new AppError(400, 'Guest count is invalid.');
  }
  const guestCount = Number(rawGuestCount);
  if (guestCount > 1500) throw new AppError(400, 'Maximum of 1,500 guests only.');
  if (!Number.isSafeInteger(guestCount)) {
    throw new AppError(400, 'Guest count must be a whole number from 1 to 1,500.');
  }
  const rawReservationId = query['reservationId'];
  if (rawReservationId !== undefined && (typeof rawReservationId !== 'string'
    || !/^[1-9]\d*$/.test(rawReservationId) || Number(rawReservationId) > 2_147_483_647)) {
    throw new AppError(400, 'Reservation identifier is invalid.');
  }
  return {
    date,
    guestCount,
    ...(rawReservationId === undefined ? {} : { reservationId: identifier(rawReservationId, 'Reservation identifier') }),
  };
}
export async function create(req:Request,res:Response,next:NextFunction){try{const submissionKey=parseBookingSubmissionKey(req.headers['idempotency-key']);const dto=parseBooking(req.body,submissionKey===undefined);if(submissionKey)dto.submissionKey=submissionKey;res.status(201).json({success:true,data:await bookingService.create(req.customer!.id,dto)});}catch(e){next(e);}}
export async function updateDetails(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.updateDetails(req.customer!.id,identifier(req.params['id']),parsePendingBookingUpdate(req.body))});}catch(e){next(e);}}
export async function availability(req:Request,res:Response,next:NextFunction){try{const input=parseAvailabilityQuery(req.query);res.json({success:true,data:await bookingService.availability(input.date,input.guestCount,req.customer!.id,input.reservationId)});}catch(e){next(e);}}
export async function mine(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.list(req.customer!.id)});}catch(e){next(e);}}
export async function one(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.byId(req.customer!.id,identifier(req.params['id']))});}catch(e){next(e);}}
export async function dashboard(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await bookingService.dashboard(req.customer!.id)});}catch(e){next(e);}}
export async function cancel(req:Request,res:Response,next:NextFunction){try{const reason=text(req.body?.reason,'Cancellation reason',{max:1000});await bookingService.cancel(req.customer!.id,identifier(req.params['id']),reason);res.status(204).send();}catch(e){next(e);}}
