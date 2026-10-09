import { routes } from './app.routes';

describe('customer account routes', () => {
  it('provides guarded destinations for profile and billing navigation', () => {
    for (const path of ['profile', 'billing']) {
      const route = routes.find((item) => item.path === path);
      expect(route, `${path} route`).toBeDefined();
      expect(route?.canActivate).toBeDefined();
    }
  });
});
