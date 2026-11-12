import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, exhaustMap, fromEvent, interval, merge, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AdminDashboard, ApiResponse } from '../models';
import { AdminAuthService } from './admin-auth.service';
import { PortalBadgeStateService } from './portal-badge-state.service';

@Injectable({ providedIn: 'root' })
export class AdminBadgeRefreshService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AdminAuthService);
  private readonly badges = inject(PortalBadgeStateService);
  private readonly router = inject(Router, { optional: true });

  constructor() {
    effect(onCleanup => {
      const user = this.auth.user();
      if (!user) { this.badges.clearAdmin(); return; }
      if (!this.http || typeof window === 'undefined') return;
      const subscription = merge(of(0), interval(30_000), fromEvent(window, 'focus')).pipe(
        exhaustMap(() => this.router?.url.startsWith('/admin/dashboard') ? EMPTY
          : this.http!.get<ApiResponse<AdminDashboard>>(`${environment.apiBaseUrl}/admin/dashboard`, { withCredentials: true, headers: { 'X-La-Chef-Background': '1' } }).pipe(catchError(() => EMPTY))),
      ).subscribe(response => {
        if (this.auth.user() === user) this.badges.setAdminDashboard(response.data);
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
