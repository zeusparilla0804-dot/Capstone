import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PackageService } from './package.service';

describe('PackageService', () => {
  it('normalizes legacy other packages into the custom gallery', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(PackageService);
    const http = TestBed.inject(HttpTestingController);

    service.load();
    http.expectOne(`${environment.apiBaseUrl}/packages`).flush({
      success: true,
      data: [
        {
          id: 13,
          name: 'Custom Celebration',
          category: 'other',
          description: 'A tailored event.',
          pricePerGuest: 850,
          features: [],
        },
      ],
    });

    const [customPackage] = service.packages();
    expect(customPackage.category).toBe('custom');
    expect(customPackage.galleryImageUrls).toHaveLength(3);
    expect(customPackage.imageUrl).toContain('/custom/custom-wide.png');
  });
});
