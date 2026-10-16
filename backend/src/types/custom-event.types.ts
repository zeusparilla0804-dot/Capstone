export type CustomEventRequestStatus =
  | 'AWAITING_QUOTE'
  | 'NEEDS_CLARIFICATION'
  | 'QUOTE_SENT'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'REJECTED'
  | 'EXPIRED';

export type CustomQuoteStatus = 'DRAFT' | 'SENT' | 'SUPERSEDED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface CreateCustomEventRequestDto {
  eventType: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  guestCount: number;
  sourcePackageId?: number;
  targetBudget?: number;
  menuPreferences?: string;
  dietaryNotes?: string;
  setupPreferences?: string;
  requestedServices: string[];
  specialRequest?: string;
}

export interface CustomEventSubmission {
  id: number;
  reservationId: number;
  reference: string;
  status: 'AWAITING_QUOTE';
}

export interface AdminCustomEventQuery {
  page: number;
  pageSize: number;
  status: CustomEventRequestStatus | '';
  search: string;
}

export interface AdminCustomEventQueueItem {
  id: number;
  reservationId: number;
  reference: string;
  customerName: string;
  eventType: string;
  eventDate: string;
  guestCount: number;
  sourcePackageName: string | null;
  targetBudget: number | null;
  status: CustomEventRequestStatus;
  currentQuoteTotal: number | null;
  createdAt: string;
}

export interface SendCustomQuoteInput {
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  total: number;
  requiredDownPayment: number;
  validUntil: string;
  terms: string | null;
}

export interface AcceptedCustomQuoteResult {
  requestId: number;
  reservationId: number;
  quoteId: number;
  invoiceId: number;
  paymentId: number;
  status: 'ACCEPTED';
}

export interface CustomQuoteItem {
  id: number;
  quoteId: number;
  sortOrder: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CustomQuote {
  id: number;
  requestId: number;
  version: number;
  subtotal: number;
  discount: number;
  total: number;
  requiredDownPayment: number;
  validUntil: string;
  terms: string | null;
  status: CustomQuoteStatus;
  sentBy: number | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
  items: CustomQuoteItem[];
}

export interface CustomEventRequest {
  id: number;
  reservationId: number;
  sourcePackageId: number | null;
  targetBudget: number | null;
  menuPreferences: string | null;
  dietaryNotes: string | null;
  setupPreferences: string | null;
  requestedServices: string[];
  specialRequests: string | null;
  status: CustomEventRequestStatus;
  clarificationReason: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  currentQuote: CustomQuote | null;
  quoteHistory: CustomQuote[];
}

export interface CustomEventRequestDetail extends CustomEventRequest {
  reference: string;
  eventType: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  guestCount: number;
  sourcePackageName: string | null;
}
