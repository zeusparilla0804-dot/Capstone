import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../services/admin-auth.service';
import { AuthService } from '../services/auth.service';

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  const base = environment.apiBaseUrl.replace(/\/$/, '');
  if (request.url !== base && !request.url.startsWith(`${base}/`)) return next(request);
  request = request.clone({ withCredentials: true, ...(!['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ? { setHeaders: { 'X-La-Chef-Request': '1' } } : {}) });
  const path = request.url.slice(environment.apiBaseUrl.length).split('?')[0];
  const protectedAdmin = /^\/admin(?:\/|$)|^\/auth\/admin\/(?:me|logout|logout-all)(?:\/|$)/.test(path);
  const protectedCustomer = /^\/(?:bookings|invoices)(?:\/|$)|^\/auth\/(?:me|logout|logout-all)(?:\/|$)/.test(path);
  const activity = protectedAdmin || path === '/auth/admin/login' ? inject(AdminAuthService) : null;
  const activityRevision = activity?.sessionVersion;
  const response = next(request).pipe(tap(event => {
    if (event instanceof HttpResponse && activity && activityRevision === activity.sessionVersion) {
      activity.noteActivity(Number(event.headers.get('X-Admin-Idle-Timeout')) || undefined);
    }
  }));
  if (!protectedAdmin && !protectedCustomer) return response;
  const auth = protectedAdmin ? inject(AdminAuthService) : inject(AuthService);
  const router = inject(Router);
  const revision = auth.sessionVersion;
  const hadUser = auth.user() !== null;
  return response.pipe(catchError(error => {
    if (error instanceof HttpErrorResponse && error.status === 401 && revision === auth.sessionVersion) {
      auth.clearSession();
      // Initial session discovery is redirected by the route guard, retaining its return URL.
      if (hadUser || !/^\/auth\/(?:admin\/)?me$/.test(path)) {
        void router.navigateByUrl(protectedAdmin ? '/admin/login' : '/login', { replaceUrl: true });
      }
    }
    return throwError(() => error);
  }));
};
