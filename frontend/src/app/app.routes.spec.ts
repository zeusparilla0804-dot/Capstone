import { routes } from './app.routes';
import { adminGuard } from './core/guards/admin.guard';

describe('customer account routes', () => {
  it('offers public email code entry without bypassing protected customer routes', () => {
    const verification = routes.find(route => route.path === 'verify-email');
    expect(verification?.data).toEqual({ verifyEmail: true });
    expect(verification?.canActivate).toBeUndefined();
    expect(routes.find(route => route.path === 'dashboard')?.canActivate?.length).toBeGreaterThan(0);
  });
  it('provides guarded destinations for profile and billing navigation', () => {
    for (const path of ['profile', 'billing']) {
      const route = routes.find((item) => item.path === path);
      expect(route, `${path} route`).toBeDefined();
      expect(route?.canActivate).toBeDefined();
    }
  });

  it('provides four public route-driven password recovery experiences', () => {
    const expected = new Map([
      ['forgot-password', { audience: 'customer', mode: 'forgot' }],
      ['reset-password', { audience: 'customer', mode: 'reset' }],
      ['admin/forgot-password', { audience: 'admin', mode: 'forgot' }],
      ['admin/reset-password', { audience: 'admin', mode: 'reset' }],
    ]);
    for (const [path, data] of expected) {
      const route = routes.find(item => item.path === path);
      expect(route, `${path} route`).toBeDefined();
      expect(route?.canActivate).toBeUndefined();
      expect(route?.data).toEqual(data);
      expect(Object.isFrozen(route?.data)).toBe(true);
    }
  });

  it('provides an admin-guarded lazy reports workspace', () => {
    const route = routes.find(item => item.path === 'admin/reports');
    expect(route).toBeDefined();
    expect(route?.canActivate).toEqual([adminGuard]);
    expect(route?.loadComponent).toBeTypeOf('function');
    expect(route?.title).toBe('Reports | LA Chef Admin');
  });

  it('keeps only the package redirect for retired custom quotations', () => {
    const redirect = routes.find(item => item.path === 'custom-event');
    expect(redirect?.redirectTo).toBe('packages');
    expect(redirect?.pathMatch).toBe('full');

    for (const path of ['custom-events/:id', 'admin/custom-events', 'admin/custom-events/:id']) {
      expect(routes.find(item => item.path === path), `${path} route`).toBeUndefined();
    }
  });
});
