export type { PaymentProofMethod, PaymentProofStatus } from './payment-proof.types.js';
export type { CustomerAccountStatus, CustomerAdminRecord, CustomerProfileUpdateInput } from './customer-admin.types.js';
import type { PaymentProofMethod, PaymentProofRecord, PaymentProofStatus } from './payment-proof.types.js';
import type { BookingAvailability } from './availability.types.js';

export interface ProofReviewQuery {
  page: number;
  pageSize: number;
  search: string;
  status: PaymentProofStatus;
  method: PaymentProofMethod | '';
  date: string;
  dateFrom: string;
  dateTo: string;
  order: 'oldest' | 'newest';
}
export type PublicPaymentProof = Omit<PaymentProofRecord, 'storageKey'> & { fileUrl: string };
export interface ProofReviewDetail {
  proof: PublicPaymentProof;
  booking: { id: number; reference: string; status: BookingStatus; eventDate: string };
  customer: { id: number; name: string; email: string };
  payment?: {
    id: number;
    amountDue: number;
    amountPaid: number;
    status: string;
    requiredDeposit: number;
    remainingDeposit: number;
    outstandingBalance: number;
  };
  invoice?: { id: number; number: string; totalAmount: number; status: string };
}

export interface PageQuery { page:number; pageSize:number; search:string; status:string; eventType:string; date:string; }
export interface PageResult<T>{items:T[];page:number;pageSize:number;totalItems:number;totalPages:number;}
interface PackageInputBase {
  eventId: number;
  name: string;
  description: string;
  minGuests: number | null;
  maxGuests: number | null;
  isActive: boolean;
}
export type PackageInput = PackageInputBase & (
  | { pricingType: 'PER_HEAD'; pricePerGuest: number; basePrice: null; includedGuests: null; excessGuestPrice: null }
  | { pricingType: 'BASE_PLUS_EXCESS'; pricePerGuest: null; basePrice: number; includedGuests: number; excessGuestPrice: number }
);
export interface AddOnInput{name:string;description:string;price:number;isActive:boolean;}
export interface PaymentInput{reservationId:number;amount:number;method:'CASH'|'BANK_TRANSFER'|'E-WALLET';reference?:string;paymentDate:string;}
export type AdminBookingCapacitySummary = BookingAvailability;

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

export interface ReportingPeriod {
  key: string;
  start: Date;
  end: Date;
}

export interface BoundedPageQuery {
  page: number;
  pageSize: number;
}

export interface CustomerHistoryQuery extends BoundedPageQuery {}

export interface EmailOutboxQuery extends BoundedPageQuery {
  search: string;
  status: '' | 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
  templateKey: string;
  relatedEntityType: string;
  relatedEntityId: string;
}

export interface AuditLogQuery extends BoundedPageQuery {
  adminId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  dateFrom: string;
  dateTo: string;
}

export interface DashboardAttentionItem {
  type: string;
  id: string;
  title: string;
  detail: string;
  eventDate: string;
  urgencyRank: number;
}

export interface AdminDashboard {
  period: string;
  priority: {
    pendingBookingReviews: number;
    proofsAwaitingVerification: number;
    confirmedEventsNextSevenDays: number;
    outstandingBalanceTotal: number;
    failedEmailNotifications: number;
  };
  ledger: {
    confirmedRevenue: number;
    submittedProofValue: number;
    overdueOutstanding: number;
    averageConfirmedBookingValue: number;
  };
  actionQueues: { key: string; count: number; href: string }[];
  attention: DashboardAttentionItem[];
}
