import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { CateringPackage, PackageCategory } from '../../core/models';
import { PackageService } from '../../core/services/package.service';
import { PackagesPageComponent } from './packages.page';
import { customerNavItems } from '../../shared/navigation/customer-navigation';

const packages: readonly CateringPackage[] = [
  {
    id: '1', name: 'PHP 480', category: 'standard', description: 'Flexible standard catering.',
    pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: null, includedGuests: null,
    excessGuestPrice: null, minGuests: null, maxGuests: null, imageUrl: 'standard.png', features: [],
  },
  {
    id: '2', name: 'Amethyst Package', category: 'debut', description: 'A milestone celebration.',
    pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: 50,
    excessGuestPrice: 650, minGuests: null, maxGuests: null, imageUrl: 'debut.png', features: [],
  },
];

describe('PackagesPageComponent editorial discovery', () => {
  let initialCategory: PackageCategory;
  let router: Router;

  beforeEach(() => {
    initialCategory = 'all';
    const state = signal(packages);
    const packageService = {
      packages: state.asReadonly(), loading: signal(false), error: signal(''), load: vi.fn(),
      getPackageById: (id: string) => state().find(item => item.id === id),
      getPackagesByCategory: (category: PackageCategory) => category === 'all' ? state() : state().filter(item => item.category === category),
    };
    TestBed.configureTestingModule({
      imports: [PackagesPageComponent],
      providers: [
        provideRouter([]),
        { provide: PackageService, useValue: packageService },
        { provide: ActivatedRoute, useValue: {
          snapshot: { queryParamMap: { get: (key: string) => key === 'category' && initialCategory !== 'all' ? initialCategory : null } },
        } },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('renders published packages as editorial experiences and includes standard catering', () => {
    const fixture = TestBed.createComponent(PackagesPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('app-package-experience')).toHaveLength(2);
    expect(element.querySelectorAll('app-package-card')).toHaveLength(0);
    expect(element.textContent).toContain('Standard Catering');
  });

  it('routes every package selection into the standard reservation flow', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PackagesPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('[data-testid="plan-package"]')?.click();
    expect(navigate).toHaveBeenCalledWith(['/book-event'], { queryParams: { package: '1' } });

    element.querySelector<HTMLButtonElement>('[data-testid="customize-package"]')?.click();
    expect(navigate).toHaveBeenCalledWith(['/book-event'], { queryParams: { package: '1' } });
  });

  it('contains no custom quotation creation entry point', () => {
    const fixture = TestBed.createComponent(PackagesPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toMatch(/quotation/i);
    expect(element.querySelector<HTMLAnchorElement>('[href^="/custom-event"]')).toBeNull();
    expect(customerNavItems().some(item => item.route === '/custom-event')).toBe(false);
  });
});
