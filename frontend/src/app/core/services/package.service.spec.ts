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

  it('maps client galleries to the matching event categories', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(PackageService);
    const http = TestBed.inject(HttpTestingController);

    service.load();
    http.expectOne(`${environment.apiBaseUrl}/packages`).flush({
      success: true,
      data: [
        { id: 1, name: 'Wedding', category: 'Wedding', description: '', pricePerGuest: 1, features: [] },
        { id: 2, name: 'Debut', category: 'Debut', description: '', pricePerGuest: 1, features: [] },
        { id: 3, name: 'Birthday', category: 'Birthday', description: '', pricePerGuest: 1, features: [] },
        { id: 4, name: 'Corporate', category: 'Corporate', description: '', pricePerGuest: 1, features: [] },
      ],
    });

    const byCategory = new Map(service.packages().map((item) => [item.category, item]));
    expect(byCategory.get('wedding')?.galleryImageUrls).toHaveLength(19);
    expect(byCategory.get('debut')?.galleryImageUrls).toHaveLength(29);
    expect(byCategory.get('birthday')?.galleryImageUrls).toHaveLength(13);
    expect(byCategory.get('corporate')?.galleryImageUrls).toHaveLength(10);
    for (const category of ['wedding', 'debut', 'birthday', 'corporate'] as const) {
      const gallery = byCategory.get(category)?.galleryImageUrls ?? [];
      expect(gallery.every((url) => url.startsWith(`assets/images/packages/${category}/client-`))).toBe(true);
      expect(byCategory.get(category)?.imageUrl).toBe(gallery[0]);
    }
  });
});
