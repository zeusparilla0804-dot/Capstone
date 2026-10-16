import { TestBed } from '@angular/core/testing';
import { CateringPackage } from '../../../core/models';
import { PackageCardComponent } from './package-card';

const cateringPackage: CateringPackage = {
  id: 'amethyst', name: 'Amethyst Package', category: 'debut',
  description: 'A complete debut setting.', pricingType: 'BASE_PLUS_EXCESS',
  pricePerGuest: null, basePrice: 85_888, includedGuests: 50, excessGuestPrice: 650,
  imageUrl: 'assets/images/packages/debut/debut-wide.png',
  galleryImageUrls: ['one.png', 'two.png'], features: [], minGuests: null, maxGuests: null,
};

describe('PackageCardComponent featured preview', () => {
  it('stays compact, shows truthful pricing, and delegates details navigation', () => {
    TestBed.configureTestingModule({ imports: [PackageCardComponent] });
    const fixture = TestBed.createComponent(PackageCardComponent);
    fixture.componentRef.setInput('cateringPackage', cateringPackage);
    const viewDetails = vi.fn();
    fixture.componentInstance.viewDetails.subscribe(viewDetails);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('PHP 85,888 for 50 guests');
    expect(element.querySelector('[aria-label="Next design image"]')).toBeNull();
    expect(element.querySelector('.package-card__planning-data')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="view-package"]')?.click();
    expect(viewDetails).toHaveBeenCalledWith(cateringPackage.id);
  });
});
