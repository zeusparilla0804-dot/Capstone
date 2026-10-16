export type PackageCategory =
  'all' | 'standard' | 'wedding' | 'birthday' | 'corporate' | 'debut' | 'anniversary' | 'custom';

export type PackagePricingType = 'PER_HEAD' | 'BASE_PLUS_EXCESS';

export interface PackageFeature {
  readonly label: string;
}

export interface CateringPackage {
  readonly id: string;
  readonly name: string;
  readonly category: Exclude<PackageCategory, 'all'>;
  readonly description: string;
  readonly pricingType: PackagePricingType;
  readonly pricePerGuest: number | null;
  readonly basePrice: number | null;
  readonly includedGuests: number | null;
  readonly excessGuestPrice: number | null;
  readonly imageUrl: string;
  readonly galleryImageUrls?: readonly string[];
  readonly features: readonly PackageFeature[];
  readonly minGuests: number | null;
  readonly maxGuests: number | null;
  readonly isPopular?: boolean;
}
