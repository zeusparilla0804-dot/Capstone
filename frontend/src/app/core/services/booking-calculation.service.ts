import { Injectable } from '@angular/core';
import { Booking, BookingAddOn, BookingPricing } from '../models';

export type BookingTotals = Omit<BookingPricing, 'packageTotal' | 'addOnTotal'>;

@Injectable({ providedIn: 'root' })
export class BookingCalculationService {
  calculateTotals(booking: Booking, downPaymentRate = 0.3): BookingTotals {
    const pricing = this.calculatePricing(
      booking.package.pricePerGuest,
      booking.guestCount,
      booking.addOns,
      booking.discount,
      downPaymentRate,
    );

    return {
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      total: pricing.total,
      downPayment: pricing.downPayment,
      remainingBalance: pricing.remainingBalance,
    };
  }

  calculatePricing(
    pricePerGuest: number,
    guestCount: number,
    addOns: readonly BookingAddOn[],
    discount = 0,
    downPaymentRate = 0.3,
  ): BookingPricing {
    const packageTotal = pricePerGuest * Math.max(guestCount, 0);
    const addOnTotal = addOns.reduce((sum, addOn) => sum + addOn.price, 0);
    const subtotal = packageTotal + addOnTotal;
    const total = Math.max(subtotal - discount, 0);
    const downPayment = Math.round(total * downPaymentRate);

    return { packageTotal, addOnTotal, subtotal, discount, total, downPayment, remainingBalance: total - downPayment };
  }
}
