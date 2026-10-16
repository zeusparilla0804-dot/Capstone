import type { BookingAvailability } from './availability.model';

export type CustomEventStatus = 'AWAITING_QUOTE' | 'NEEDS_CLARIFICATION' | 'QUOTE_SENT' | 'ACCEPTED' | 'DECLINED' | 'REJECTED' | 'EXPIRED';
export type CustomQuoteStatus = 'DRAFT' | 'SENT' | 'SUPERSEDED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface CustomEventRequestInput {
  readonly eventType: string;
  readonly eventDate: string;
  readonly eventTime: string;
  readonly venue: string;
  readonly guestCount: number;
  readonly sourcePackageId?: number;
  readonly targetBudget?: number;
  readonly menuPreferences?: string;
  readonly dietaryNotes?: string;
  readonly setupPreferences?: string;
  readonly requestedServices: readonly string[];
  readonly specialRequest?: string;
}

export interface CustomEventSubmission {
  readonly id: number;
  readonly reservationId: number;
  readonly reference: string;
  readonly status: 'AWAITING_QUOTE';
}

export interface CustomQuoteItem {
  readonly id: number;
  readonly quoteId: number;
  readonly sortOrder: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

export interface CustomQuote {
  readonly id: number;
  readonly requestId: number;
  readonly version: number;
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
  readonly requiredDownPayment: number;
  readonly validUntil: string;
  readonly terms: string | null;
  readonly status: CustomQuoteStatus;
  readonly sentAt: string | null;
  readonly acceptedAt: string | null;
  readonly declinedAt: string | null;
  readonly createdAt: string;
  readonly items: readonly CustomQuoteItem[];
}

export interface CustomEventDetail {
  readonly id: number;
  readonly reservationId: number;
  readonly reference: string;
  readonly eventType: string;
  readonly eventDate: string;
  readonly eventTime: string;
  readonly venue: string;
  readonly guestCount: number;
  readonly sourcePackageId: number | null;
  readonly sourcePackageName: string | null;
  readonly targetBudget: number | null;
  readonly menuPreferences: string | null;
  readonly dietaryNotes: string | null;
  readonly setupPreferences: string | null;
  readonly requestedServices: readonly string[];
  readonly specialRequests: string | null;
  readonly status: CustomEventStatus;
  readonly clarificationReason: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentQuote: CustomQuote | null;
  readonly quoteHistory: readonly CustomQuote[];
}

export interface CustomEventFormAvailability extends BookingAvailability {}
