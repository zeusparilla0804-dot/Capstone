import { TestBed } from '@angular/core/testing';
import { CateringPackage } from '../../../core/models';
import { PackageExperienceComponent } from './package-experience';

const debutPackage: CateringPackage = {
  id: '20', name: 'Amethyst Package', category: 'debut',
  description: 'A complete debut setting shaped for an unforgettable milestone.',
  pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888,
  includedGuests: 50, excessGuestPrice: 650, minGuests: null, maxGuests: null,
  imageUrl: 'assets/images/packages/debut/debut-wide.png',
  galleryImageUrls: [
    'assets/images/packages/debut/debut-wide.png',
    'assets/images/packages/debut/debut-buffet.png',
    'assets/images/packages/debut/debut-table.png',
  ],
  features: [{ label: 'Three main dishes' }, { label: 'Complete catering setup' }, { label: 'Debut backdrop' }],
};

describe('PackageExperienceComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders service-led pricing and alternates the editorial composition', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    fixture.componentRef.setInput('position', 1);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.package-experience')?.classList).toContain('package-experience--reverse');
    expect(element.textContent).toContain('PHP 85,888 includes 50 guests');
    expect(element.textContent).toContain('PHP 650 for each additional guest');
    expect(element.textContent).not.toContain('Starting at');
    expect(element.textContent).not.toContain('Buy');
  });

  it('expands full inclusions and emits plan, inclusion, and customization intent', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    const component = fixture.componentInstance;
    const plan = vi.fn();
    const inclusions = vi.fn();
    const customize = vi.fn();
    component.planPackage.subscribe(plan);
    component.viewInclusions.subscribe(inclusions);
    component.customizePackage.subscribe(customize);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('[data-testid="full-inclusion"]')).toHaveLength(0);
    element.querySelector<HTMLButtonElement>('[data-testid="view-inclusions"]')?.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-testid="full-inclusion"]')).toHaveLength(3);
    expect(inclusions).toHaveBeenCalledWith(debutPackage.id);

    element.querySelector<HTMLButtonElement>('[data-testid="plan-package"]')?.click();
    element.querySelector<HTMLButtonElement>('[data-testid="customize-package"]')?.click();
    expect(plan).toHaveBeenCalledWith(debutPackage.id);
    expect(customize).toHaveBeenCalledWith(debutPackage.id);
  });

  it('navigates gallery images through click zones, keyboard keys, and horizontal swipes', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    const element = fixture.nativeElement as HTMLElement;
    const status = () => element.querySelector('[aria-live="polite"]')?.textContent?.trim();

    expect(status()).toBe('Design image 1 of 3');
    element.querySelector<HTMLButtonElement>('[aria-label="Next design image"]')?.click();
    fixture.detectChanges();
    expect(status()).toBe('Design image 2 of 3');

    element.querySelector<HTMLElement>('.package-experience__media')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(status()).toBe('Design image 3 of 3');

    component.onTouchStart({ changedTouches: [{ clientX: 260 }] });
    component.onTouchEnd({ changedTouches: [{ clientX: 180 }] });
    fixture.detectChanges();
    expect(status()).toBe('Design image 1 of 3');

    component.onTouchStart({ changedTouches: [{ clientX: 180 }] });
    component.onTouchEnd({ changedTouches: [{ clientX: 155 }] });
    fixture.detectChanges();
    expect(status()).toBe('Design image 1 of 3');
  });

  it('marks the media as reduced motion when the customer requests it', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.package-experience__media')?.classList).toContain('is-reduced-motion');
  });
});
