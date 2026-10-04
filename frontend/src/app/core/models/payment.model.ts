export type PaymentMethod = 'cash' | 'bank-transfer' | 'gcash' | 'card';

export interface Payment {
  readonly id: string;
  readonly bookingId: string;
  readonly method: PaymentMethod;
  readonly amount: number;
  readonly paidAt?: string;
  readonly status: 'pending' | 'paid' | 'failed';
}
