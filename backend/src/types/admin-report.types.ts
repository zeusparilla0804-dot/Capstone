import type { BookingStatus } from './admin.types.js';

export interface ReservationReportQuery {
  dateFrom: string;
  dateTo: string;
  status: BookingStatus | '';
  eventType: string;
}

export type PaymentReportStatus = '' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentReportMethod = '' | 'CASH' | 'BANK_TRANSFER' | 'E-WALLET';

export interface PaymentReportQuery {
  dateFrom: string;
  dateTo: string;
  status: PaymentReportStatus;
  method: PaymentReportMethod;
}

export type CollectionReportQuery = Omit<PaymentReportQuery, 'status'>;

export interface ReservationReportItem {
  reference: string;
  customer: string;
  eventDate: string;
  eventTime: string;
  eventType: string;
  guestCount: number;
  venue: string;
  packageName: string;
  status: BookingStatus;
}

export interface PaymentReportItem {
  invoiceNumber: string;
  bookingReference: string;
  customer: string;
  issuedDate: string;
  latestPaymentDate: string;
  method: string;
  amountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  status: PaymentReportStatus;
}

export interface AdminReservationReport {
  filters: ReservationReportQuery;
  summary: { reservationCount: number; totalGuests: number };
  items: ReservationReportItem[];
  upcomingItems: ReservationReportItem[];
}

export interface AdminPaymentReport {
  filters: PaymentReportQuery;
  summary: { totalBilled: number; verifiedPayments: number; outstandingBalance: number };
  items: PaymentReportItem[];
}

export interface CollectionReportItem {
  id: string;
  invoiceNumber: string;
  bookingReference: string;
  customer: string;
  paymentDate: string;
  method: string;
  amount: number;
  source: 'transaction' | 'legacy';
}

export interface AdminCollectionReport {
  filters: CollectionReportQuery;
  summary: { totalCollected: number; paymentCount: number };
  items: CollectionReportItem[];
}
