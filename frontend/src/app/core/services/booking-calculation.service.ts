import { Injectable } from '@angular/core';
import { Booking, BookingAddOn, BookingPricing, CateringPackage } from '../models';

export type BookingTotals = Omit<BookingPricing, 'packageTotal' | 'addOnTotal'>;
export const RESERVATION_DEPOSIT_RATE = 0.5;

@Injectable({ providedIn: 'root' })
export class BookingCalculationService {
  calculateTotals(booking: Booking, downPaymentRate = RESERVATION_DEPOSIT_RATE): BookingTotals {
    const pricing = this.calculatePackagePricing(
      booking.package,
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

  calculatePackagePricing(
    pkg: Pick<CateringPackage, 'pricingType' | 'pricePerGuest' | 'basePrice' | 'includedGuests' | 'excessGuestPrice'>,
    guestCount: number,
    addOns: readonly BookingAddOn[],
    discount = 0,
    downPaymentRate = RESERVATION_DEPOSIT_RATE,
  ): BookingPricing {
    const guests = Math.max(guestCount, 0);
    const packageTotal = pkg.pricingType === 'BASE_PLUS_EXCESS'
      ? this.money((pkg.basePrice ?? 0) + Math.max(guests - (pkg.includedGuests ?? 0), 0) * (pkg.excessGuestPrice ?? 0))
      : this.money((pkg.pricePerGuest ?? 0) * guests);
    const addOnTotal = this.money(addOns.reduce((sum, addOn) => sum + addOn.price, 0));
    const subtotal = this.money(packageTotal + addOnTotal);
    const normalizedDiscount = this.money(discount);
    const total = this.money(Math.max(subtotal - normalizedDiscount, 0));
    const downPayment = this.money(total * downPaymentRate);

    return {
      packageTotal,
      addOnTotal,
      subtotal,
      discount: normalizedDiscount,
      total,
      downPayment,
      remainingBalance: this.money(total - downPayment),
    };
  }

  calculatePricing(
    pricePerGuest: number,
    guestCount: number,
    addOns: readonly BookingAddOn[],
    discount = 0,
    downPaymentRate = RESERVATION_DEPOSIT_RATE,
  ): BookingPricing {
    return this.calculatePackagePricing({
      pricingType: 'PER_HEAD', pricePerGuest, basePrice: null, includedGuests: null, excessGuestPrice: null,
    }, guestCount, addOns, discount, downPaymentRate);
  }

  private money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
