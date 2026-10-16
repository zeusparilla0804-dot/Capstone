import { CateringPackage } from '../models';

function amount(value: number | null): string {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value ?? 0);
}

export function packagePricingExplanation(pkg: CateringPackage): string {
  if (pkg.pricingType === 'BASE_PLUS_EXCESS') {
    return `PHP ${amount(pkg.basePrice)} includes ${pkg.includedGuests ?? 0} guests, then PHP ${amount(pkg.excessGuestPrice)} for each additional guest.`;
  }
  return `PHP ${amount(pkg.pricePerGuest)} per guest.`;
}

export function packagePricingSummary(pkg: CateringPackage): string {
  return pkg.pricingType === 'BASE_PLUS_EXCESS'
    ? `PHP ${amount(pkg.basePrice)} for ${pkg.includedGuests ?? 0} guests`
    : `PHP ${amount(pkg.pricePerGuest)} per guest`;
}
