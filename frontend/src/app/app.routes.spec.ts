import { routes } from './app.routes';

describe('customer account routes', () => {
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
});
