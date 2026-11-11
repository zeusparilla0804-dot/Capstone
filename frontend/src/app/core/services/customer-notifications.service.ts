import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CustomerAccountScopeService } from './customer-account-scope.service';
import { ApiResponse } from '../models';

export interface CustomerNotification {
  readonly id: string; readonly title: string; readonly message: string; readonly reference: string;
  readonly createdAt: string; readonly isRead: boolean; readonly link: string;
}
@Injectable({ providedIn: 'root' })
export class CustomerNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly scope = inject(CustomerAccountScopeService);
  private readonly state = signal<readonly CustomerNotification[]>([]);
  readonly items = this.state.asReadonly();
  readonly unreadCount = computed(() => this.items().filter(item => !item.isRead).length);
  readonly loading = signal(false);
  readonly error = signal('');
  constructor() {
    this.scope.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.state.set([]); this.loading.set(false); this.error.set('');
    });
  }
  refresh(): void {
    if (this.loading()) return;
    const generation = this.scope.generation;
    this.loading.set(true);
    this.http.get<ApiResponse<readonly CustomerNotification[]>>(`${environment.apiBaseUrl}/notifications`, { withCredentials: true })
      .pipe(takeUntil(this.scope.changes), finalize(() => { if (generation === this.scope.generation) this.loading.set(false); }))
      .subscribe({ next: response => {
        if (generation !== this.scope.generation) return;
        this.state.set(response.data); this.error.set('');
      }, error: () => { if (generation === this.scope.generation) this.error.set('Unable to load updates. Try again.'); } });
  }
  markRead(ids: readonly string[]): void {
    if (!ids.length) return;
    const generation = this.scope.generation;
    this.http.post(`${environment.apiBaseUrl}/notifications/read`, { ids }, { withCredentials: true })
      .pipe(takeUntil(this.scope.changes)).subscribe({ next: () => {
        if (generation === this.scope.generation) this.state.update(items => items.map(item => ids.includes(item.id) ? { ...item, isRead: true } : item));
      }, error: () => { if (generation === this.scope.generation) this.error.set('Unable to mark updates as read. Try again.'); } });
  }
  markAllRead(): void { this.markRead(this.items().filter(item => !item.isRead).map(item => item.id)); }
}
