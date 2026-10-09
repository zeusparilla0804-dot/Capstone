import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  return await auth.ensure()
    || router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};
