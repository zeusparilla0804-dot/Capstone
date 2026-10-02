export type { PaymentProofMethod, PaymentProofStatus } from './payment-proof.types.js';

export interface PageQuery { page:number; pageSize:number; search:string; status:string; eventType:string; date:string; }
export interface PageResult<T>{items:T[];page:number;pageSize:number;totalItems:number;totalPages:number;}
export interface PackageInput{eventId:number;name:string;description:string;pricePerGuest:number;minGuests:number;maxGuests:number;isActive:boolean;}
export interface AddOnInput{name:string;description:string;price:number;isActive:boolean;}
export interface PaymentInput{reservationId:number;amount:number;method:'CASH'|'BANK_TRANSFER'|'E-WALLET';reference?:string;paymentDate:string;}

export type BookingStatus = 'PENDING' | 'APPROVED' | 'AWAITING_PAYMENT' | 'PAYMENT_SUBMITTED' | 'PAYMENT_VERIFIED' | 'CONFIRMED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type BookingActor = { type: 'ADMIN'; id: number } | { type: 'CUSTOMER'; id: number } | { type: 'SYSTEM'; id?: never };
export interface BookingStatusHistory {
  id: number;
  previousStatus: BookingStatus | null;
  nextStatus: BookingStatus;
  actorType: BookingActor['type'];
  actorId: number | null;
  reason: string | null;
  createdAt: Date;
}
