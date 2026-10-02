import { CateringPackage } from './package.model';
import { PaymentMethod } from './payment.model';

export type EventType = 'wedding' | 'birthday' | 'corporate' | 'debut' | 'anniversary' | 'other';
export type BookingStatus = 'pending' | 'approved' | 'awaiting_payment' | 'payment_submitted' | 'payment_verified' | 'confirmed' | 'completed' | 'rejected' | 'cancelled';

export interface BookingAddOn {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number;
}

export interface BookingDraft {
  readonly eventType: EventType | null;
  readonly eventDate: string;
  readonly eventTime: string;
  readonly venue: string;
  readonly guestCount: number;
  readonly packageId: CateringPackage['id'] | null;
  readonly selectedAddOnIds: readonly BookingAddOn['id'][];
  readonly paymentMethod: PaymentMethod | null;
}

export interface BookingPricing {
  readonly packageTotal: number;
  readonly addOnTotal: number;
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
  readonly downPayment: number;
  readonly remainingBalance: number;
}

export interface BookingPackageSummary {
  readonly packageId: CateringPackage['id'];
  readonly packageName: string;
  readonly pricePerGuest: number;
}

export interface Booking {
  readonly id: string;
  readonly invoiceId?: number;
  readonly reference: string;
  readonly customerId: string;
  readonly eventName: string;
  readonly eventType: EventType;
  readonly eventDate: string;
  readonly eventTime: string;
  readonly venue: string;
  readonly guestCount: number;
  readonly package: BookingPackageSummary;
  readonly addOns: readonly BookingAddOn[];
  readonly discount: number;
  readonly status: BookingStatus;
  readonly paymentMethod?: PaymentMethod;
  readonly amountPaid: number;
  readonly createdAt: string;
  readonly cancelledAt?: string;
  readonly thumbnailUrl: string;
}

export type BookingTab = 'upcoming' | 'past' | 'cancelled';
