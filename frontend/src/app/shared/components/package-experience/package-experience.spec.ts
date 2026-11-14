import { TestBed } from '@angular/core/testing';
import { CateringPackage } from '../../../core/models';
import { PackageExperienceComponent } from './package-experience';

const debutPackage: CateringPackage = {
  id: '20', name: 'Sample Debut Package', category: 'debut',
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('expands and collapses inclusions when more than three are available', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', {
      ...debutPackage,
      features: [...debutPackage.features, { label: 'Welcome drinks' }],
    });
    const component = fixture.componentInstance;
    const inclusions = vi.fn();
    component.viewInclusions.subscribe(inclusions);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('[data-testid="full-inclusion"]')).toHaveLength(0);
    element.querySelector<HTMLButtonElement>('[data-testid="view-inclusions"]')?.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-testid="full-inclusion"]')).toHaveLength(4);
    expect(element.textContent).toContain('Welcome drinks');
    expect(inclusions).toHaveBeenCalledWith(debutPackage.id);

    element.querySelector<HTMLButtonElement>('[data-testid="view-inclusions"]')!.click();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Welcome drinks');
    expect(element.querySelector('[data-testid="view-inclusions"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([0, 1, 3])('does not offer an inclusions toggle for %i already-visible inclusions', (count) => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', { ...debutPackage, features: debutPackage.features.slice(0, count) });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.package-experience__inclusions li')).toHaveLength(count);
    expect(element.querySelector('[data-testid="view-inclusions"]')).toBeNull();
  });

  it('offers one package planning action and emits the selected package', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    const plan = vi.fn();
    fixture.componentInstance.planPackage.subscribe(plan);
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelectorAll('.package-experience__actions button') as NodeListOf<HTMLButtonElement>;
    expect(actions).toHaveLength(1);
    actions[0]!.click();
    expect(plan).toHaveBeenCalledExactlyOnceWith('20');
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

  it('keeps long gallery pagination compact without hiding the full image count', () => {
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', {
      ...debutPackage,
      galleryImageUrls: Array.from({ length: 29 }, (_, index) => `client-debut-${index + 1}.jpg`),
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.gallery-dots span')).toHaveLength(7);
    expect(element.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Design image 1 of 29');

    element.querySelector<HTMLElement>('.package-experience__media')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End' }),
    );
    fixture.detectChanges();
    expect(element.querySelectorAll('.gallery-dots span')).toHaveLength(7);
    expect(element.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Design image 29 of 29');
  });

  it('marks the media as reduced motion when the customer requests it', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    TestBed.configureTestingModule({ imports: [PackageExperienceComponent] });
    const fixture = TestBed.createComponent(PackageExperienceComponent);
    fixture.componentRef.setInput('cateringPackage', debutPackage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.package-experience__media')?.classList).toContain('is-reduced-motion');
  });
});
