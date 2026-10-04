export interface AuthenticatedCustomer { id: number; fullName: string; email: string; role: 'customer'; }
export interface AuthenticatedAdmin { id: number; fullName: string; email: string; role: 'admin'; }
export interface PackageRecord { id: number; name: string; category: string; description: string; pricePerGuest: number; minGuests: number; maxGuests: number; features: { label: string }[]; }
export interface AddOnRecord { id: number; name: string; description: string; price: number; }
export interface CreateBookingDto { eventType: string; eventDate: string; eventTime: string; venue: string; guestCount: number; packageId: number; addOnIds: number[]; paymentMethod?: string; }
export interface BookingRecord { id: number; invoiceId?: number; reference: string; eventName: string; eventType: string; eventDate: string; eventTime: string; venue: string; guestCount: number; package: { packageId: number; packageName: string; pricePerGuest: number }; addOns: AddOnRecord[]; discount: number; total: number; status: string; amountPaid: number; createdAt: string; }

declare global {
  namespace Express { interface Request { customer?: AuthenticatedCustomer; admin?: AuthenticatedAdmin; } }
}
