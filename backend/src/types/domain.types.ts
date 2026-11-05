export interface AuthenticatedCustomer { id: number; fullName: string; email: string; phone: string; role: 'customer'; }
export interface AuthenticatedAdmin { id: number; fullName: string; email: string; role: 'admin'; }
export type PackagePricingType = 'PER_HEAD' | 'BASE_PLUS_EXCESS';
export interface PackagePricingSnapshot {
  pricingType: PackagePricingType;
  pricePerGuest: number | null;
  basePrice: number | null;
  includedGuests: number | null;
  excessGuestPrice: number | null;
  packageTotal: number;
}
export interface PackageRecord {
  id: number;
  name: string;
  category: string;
  description: string;
  pricingType: PackagePricingType;
  pricePerGuest: number | null;
  basePrice: number | null;
  includedGuests: number | null;
  excessGuestPrice: number | null;
  minGuests: number | null;
  maxGuests: number | null;
  features: { label: string }[];
}
export interface AddOnRecord { id: number; name: string; description: string; price: number; quantity?: number; unitPrice?: number; }
export interface CreateBookingDto { eventType: string; eventDate: string; eventTime: string; venue: string; guestCount: number; packageId: number; addOnIds: number[]; addOnQuantities?: Record<string, number>; paymentMethod?: string; specialRequest?: string; submissionKey?: string; }
export type UpdatePendingBookingDto = Omit<CreateBookingDto, 'submissionKey'>;
export interface BookingPackageSnapshot extends PackagePricingSnapshot { packageId: number; packageName: string; }
export interface BookingRecord { id: number; invoiceId?: number; reference: string; eventName: string; eventType: string; eventDate: string; eventTime: string; venue: string; guestCount: number; specialRequest?: string; package: BookingPackageSnapshot; addOns: AddOnRecord[]; discount: number; total: number; status: string; paymentMethod?: string; amountPaid: number; createdAt: string; }

declare global {
  namespace Express { interface Request { customer?: AuthenticatedCustomer; admin?: AuthenticatedAdmin; } }
}
