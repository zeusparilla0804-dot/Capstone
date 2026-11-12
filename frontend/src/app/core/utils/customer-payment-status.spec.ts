import type { Booking } from '../models';
import { customerPaymentStatus, hasCashPaymentAction, hasOnlinePaymentAction, needsPaymentMethodChoice } from './customer-payment-status';

const reservation = (overrides: Partial<Booking> = {}): Booking => ({
  id: '1088', reference: 'TEST', customerId: '7', eventName: 'Event', eventType: 'wedding',
  eventDate: '2027-01-12', eventTime: '12:00', venue: 'Venue', guestCount: 50,
  package: { packageId: '1', packageName: 'Package', pricingType: 'PER_HEAD', pricePerGuest: 200,
    basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 10000 },
  addOns: [], discount: 0, status: 'payment_verified', amountPaid: 37150, total: 74300,
  createdAt: '2026-10-29', thumbnailUrl: '', ...overrides,
});

describe('customerPaymentStatus', () => {
  it('exposes a supported-method switch only for unpaid legacy bookings without proof history', () => {
    const old = reservation({ status: 'awaiting_payment', paymentMethod: 'gcash', amountPaid: 0 });
    expect(needsPaymentMethodChoice(old)).toBe(true);
    expect(needsPaymentMethodChoice({ ...old, amountPaid: 10 })).toBe(false);
    expect(needsPaymentMethodChoice({ ...old, latestProofStatus: 'REJECTED' })).toBe(false);
    expect(needsPaymentMethodChoice({ ...old, status: 'cancelled' })).toBe(false);
  });

  it('keeps office instructions accessible for a completed event with an unrecorded balance', () => {
    expect(hasCashPaymentAction(reservation({ paymentMethod: 'cash', status: 'completed' }))).toBe(true);
    expect(hasCashPaymentAction(reservation({ paymentMethod: 'cash', status: 'completed', amountPaid: 74300 }))).toBe(false);
  });

  it('offers balance proof submission after verification, confirmation and completion without offering it for cash or fully paid bookings', () => {
    for (const status of ['payment_verified', 'confirmed', 'completed'] as const) {
      expect(hasOnlinePaymentAction(reservation({ status, paymentMethod: 'bank-transfer' }))).toBe(true);
      expect(hasOnlinePaymentAction(reservation({ status, paymentMethod: 'gcash' }))).toBe(false);
      expect(hasOnlinePaymentAction(reservation({ status, paymentMethod: 'cash' }))).toBe(false);
      expect(hasOnlinePaymentAction(reservation({ status, paymentMethod: 'bank-transfer', amountPaid: 74300 }))).toBe(false);
    }
    for (const status of ['pending', 'approved', 'cancelled', 'rejected'] as const) {
      expect(hasOnlinePaymentAction(reservation({ status, paymentMethod: 'bank-transfer' }))).toBe(false);
    }
  });
  it('shows awaiting cash only for an approved unpaid cash booking without changing confirmation', () => {
    expect(customerPaymentStatus(reservation({ paymentMethod: 'cash', status: 'pending', amountPaid: 0 }))).toBe('pending');
    expect(customerPaymentStatus(reservation({ paymentMethod: 'cash', status: 'awaiting_payment', amountPaid: 0 }))).toBe('awaiting_cash_payment');
    expect(customerPaymentStatus(reservation({ paymentMethod: 'cash', amountPaid: 37150 }))).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ paymentMethod: 'cash', amountPaid: 74300 }))).toBe('fully_paid');
  });
  it('distinguishes the actual verified deposit, additional partial payments, and full upfront payment', () => {
    expect(customerPaymentStatus(reservation())).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ amountPaid: 50000 }))).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ amountPaid: 74300 }))).toBe('fully_paid');
    expect(customerPaymentStatus(reservation({ amountPaid: [10000, 20000, 7150].reduce((sum, value) => sum + value, 0) }))).toBe('down_payment_verified');
  });

  it('never treats submitted claims or unpaid verification flags as verified money', () => {
    expect(customerPaymentStatus(reservation({ status: 'payment_submitted', amountPaid: 0 }))).toBe('pending_payment_verification');
    expect(customerPaymentStatus(reservation({ status: 'payment_submitted' }))).toBe('pending_payment_verification');
    expect(customerPaymentStatus(reservation({ amountPaid: 0 }))).toBe('awaiting_payment');
    expect(customerPaymentStatus(reservation({ status: 'pending', amountPaid: 0 }))).toBe('pending');
    expect(customerPaymentStatus(reservation({ status: 'awaiting_payment', amountPaid: 0 }))).toBe('awaiting_payment');
  });

  it('checks the half-payment boundary in cents and does not change reservation confirmation', () => {
    expect(customerPaymentStatus(reservation({ total: 74300.01, amountPaid: 37150 }))).toBe('down_payment_incomplete');
    expect(customerPaymentStatus(reservation({ total: 74300.01, amountPaid: 37150.01 }))).toBe('down_payment_verified');
    const booking = reservation({ status: 'confirmed' });
    expect(customerPaymentStatus(booking)).toBe('down_payment_verified');
    expect(booking.status).toBe('confirmed');
    expect(customerPaymentStatus(reservation({ status: 'cancelled' }))).toBe('cancelled');
    expect(customerPaymentStatus(reservation({ status: 'rejected' }))).toBe('rejected');
    expect(customerPaymentStatus(reservation({ total: 0, amountPaid: 0 }))).toBe('awaiting_payment');
  });

  it('supports older records using their stored package and add-on snapshots', () => {
    expect(customerPaymentStatus(reservation({ total: undefined, amountPaid: 5000 }))).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ total: undefined, amountPaid: 10000 }))).toBe('fully_paid');
  });

  it('uses the latest proof and verified amount after rejection or refresh', () => {
    expect(customerPaymentStatus(reservation({ status: 'awaiting_payment', amountPaid: 0, latestProofStatus: 'REJECTED' }))).toBe('payment_rejected');
    expect(customerPaymentStatus(reservation({ status: 'awaiting_payment', amountPaid: 1000, latestProofStatus: 'REJECTED' }))).toBe('payment_rejected');
    expect(customerPaymentStatus(reservation({ status: 'payment_verified', amountPaid: 37150, latestProofStatus: 'REJECTED' }))).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ status: 'completed', amountPaid: 37150 }))).toBe('down_payment_verified');
    expect(customerPaymentStatus(reservation({ status: 'completed', amountPaid: 74300 }))).toBe('fully_paid');
    expect(customerPaymentStatus(reservation({ status: 'awaiting_payment', amountPaid: 0, latestProofStatus: 'SUBMITTED' }))).toBe('pending_payment_verification');
  });
});
