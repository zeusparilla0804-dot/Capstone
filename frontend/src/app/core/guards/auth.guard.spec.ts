import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('customer authGuard', () => {
  it('requires sign-in before an unauthenticated customer can enter the dashboard', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), {
      provide: AuthService, useValue: { ensureAuthenticated: vi.fn().mockResolvedValue(false) },
    }] });
    const result = await TestBed.runInInjectionContext(() => authGuard(
      {} as ActivatedRouteSnapshot, { url: '/dashboard' } as RouterStateSnapshot,
    ));
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>))
      .toBe('/login?returnUrl=%2Fdashboard');
  });
});
