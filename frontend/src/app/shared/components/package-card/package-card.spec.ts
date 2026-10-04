import { TestBed } from '@angular/core/testing';
import { CateringPackage } from '../../../core/models';
import { PackageCardComponent } from './package-card';

describe('PackageCardComponent', () => {
  const cateringPackage: CateringPackage = {
    id: 'birthday-celebration',
    name: 'Birthday Celebration',
    category: 'birthday',
    description: 'A joyful Filipino celebration package.',
    pricePerGuest: 560,
    imageUrl: 'assets/images/packages/deluxe-package.webp',
    galleryImageUrls: [
      'assets/images/packages/birthday/birthday-wide.png',
      'assets/images/packages/birthday/birthday-buffet.png',
      'assets/images/packages/birthday/birthday-table.png',
    ],
    features: [{ label: 'Four main dishes' }],
    minGuests: 25,
    maxGuests: 120,
  };

  it('cycles through the gallery from image click zones with in-image progress dots', async () => {
    await TestBed.configureTestingModule({ imports: [PackageCardComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PackageCardComponent);
    fixture.componentRef.setInput('cateringPackage', cateringPackage);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const nextButton = element.querySelector<HTMLButtonElement>('[aria-label="Next design image"]');
    const previousButton = element.querySelector<HTMLButtonElement>(
      '[aria-label="Previous design image"]',
    );

    expect(nextButton).not.toBeNull();
    expect(previousButton).not.toBeNull();
    expect(nextButton?.closest('.package-card__media')).not.toBeNull();
    expect(element.querySelector('.package-card__gallery-rail')).toBeNull();
    expect(element.querySelectorAll('.package-card__gallery-dot')).toHaveLength(3);
    expect(element.querySelectorAll('.package-card__gallery-dot.is-active')).toHaveLength(1);
    expect(element.querySelector('.package-card__gallery-status')?.textContent?.trim()).toBe(
      'Design image 1 of 3',
    );

    nextButton?.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLImageElement>('.package-card__media img')?.src).toContain(
      'birthday-buffet.png',
    );
    expect(element.querySelector('.package-card__gallery-status')?.textContent?.trim()).toBe(
      'Design image 2 of 3',
    );

    previousButton?.click();
    previousButton?.click();
    fixture.detectChanges();
    expect(element.querySelector<HTMLImageElement>('.package-card__media img')?.src).toContain(
      'birthday-table.png',
    );
    expect(element.querySelector('.package-card__gallery-status')?.textContent?.trim()).toBe(
      'Design image 3 of 3',
    );
  });
});
