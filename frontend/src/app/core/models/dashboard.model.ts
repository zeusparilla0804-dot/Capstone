import { BookingStatus } from './booking.model';

export interface StatCard {
  readonly label: string;
  readonly value: string;
  readonly supportingText?: string;
  readonly tone?: 'gold' | 'green' | 'red' | 'dark';
}

export interface CustomerPaymentSummary {
  readonly bookingId: string;
  readonly eventName: string;
  readonly total: number;
  readonly paid: number;
  readonly balance: number;
}

export interface CustomerActivity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dateLabel: string;
  readonly type: 'booking' | 'payment' | 'confirmation';
}

export interface DashboardBookingRow {
  readonly id: string;
  readonly title: string;
  readonly customerName?: string;
  readonly eventType?: string;
  readonly dateLabel: string;
  readonly status: BookingStatus;
  readonly thumbnailUrl?: string;
}

export interface DashboardSummary {
  readonly stats: readonly StatCard[];
  readonly recentBookings: readonly DashboardBookingRow[];
}

export interface CustomerDashboardSummary extends DashboardSummary {
  readonly payment: CustomerPaymentSummary;
  readonly recentActivity: readonly CustomerActivity[];
}
