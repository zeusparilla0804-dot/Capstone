export type PackageCategory =
  'all' | 'wedding' | 'birthday' | 'corporate' | 'debut' | 'anniversary' | 'custom';

export interface PackageFeature {
  readonly label: string;
}

export interface CateringPackage {
  readonly id: string;
  readonly name: string;
  readonly category: Exclude<PackageCategory, 'all'>;
  readonly description: string;
  readonly pricePerGuest: number | null;
  readonly imageUrl: string;
  readonly galleryImageUrls?: readonly string[];
  readonly features: readonly PackageFeature[];
  readonly minGuests?: number;
  readonly maxGuests?: number;
  readonly isPopular?: boolean;
}
