import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  it('redirects after an asynchronous session check without losing the injection context', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { ensure: vi.fn(async () => false) } },
      ],
    });

    const result = await TestBed.runInInjectionContext(() => adminGuard(
      {} as never,
      { url: '/admin/bookings' } as never,
    ));

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree))
      .toBe('/admin/login?returnUrl=%2Fadmin%2Fbookings');
  });
});
