import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { BookingDraftService } from './booking-draft.service';
import { PackageService } from './package.service';

describe('BookingDraftService package selection', () => {
  it('preserves a package selected before the catalog request completes', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const draft = TestBed.inject(BookingDraftService);
    const packages = TestBed.inject(PackageService);
    const http = TestBed.inject(HttpTestingController);

    draft.selectPackage('13');
    expect(draft.draft().packageId).toBe('13');
    expect(draft.selectedPackage()).toBeUndefined();

    packages.load();
    http.expectOne(`${environment.apiBaseUrl}/packages`).flush({
      success: true,
      data: [
        {
          id: 13,
          name: 'Custom Celebration',
          category: 'other',
          description: 'A tailored event.',
          pricePerGuest: 850,
          minGuests: 20,
          maxGuests: 100,
          features: [],
        },
      ],
    });

    expect(draft.selectedPackage()?.id).toBe('13');
    http.verify();
  });
});
