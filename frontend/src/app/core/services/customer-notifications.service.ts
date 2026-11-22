import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CustomerAccountScopeService } from './customer-account-scope.service';
import { ApiResponse } from '../models';
import { notificationCategories, notificationCategory, notificationReadFilters, type NotificationCategory, type NotificationReadStatus } from '../models/notification-filter.model';

export interface CustomerNotification {
  readonly id: string; readonly type?: string; readonly title: string; readonly message: string; readonly reference: string;
  readonly createdAt: string; readonly isRead: boolean; readonly link: string;
}
@Injectable({ providedIn: 'root' })
export class CustomerNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly scope = inject(CustomerAccountScopeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<readonly CustomerNotification[]>([]);
  readonly items = this.state.asReadonly();
  readonly unreadCount = computed(() => this.items().filter(item => !item.isRead).length);
  private readonly statusFilter = signal<NotificationReadStatus>('all');
  private readonly categoryFilter = signal<NotificationCategory>('all');
  readonly readStatus = this.statusFilter.asReadonly();
  readonly category = this.categoryFilter.asReadonly();
  readonly readFilters = notificationReadFilters;
  readonly categories = notificationCategories.filter(({ value }) =>
    value === 'all' || value === 'reservations' || value === 'payments');
  readonly filteredItems = computed(() => this.items().filter(item =>
    (this.readStatus() === 'all' || (this.readStatus() === 'read' ? item.isRead : !item.isRead)) &&
    (this.category() === 'all' || this.itemCategory(item) === this.category())));
  readonly loading = signal(false);
  readonly error = signal('');
  private fetch?: Subscription;
  constructor() {
    this.scope.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.state.set([]); this.loading.set(false); this.error.set(''); this.statusFilter.set('all'); this.categoryFilter.set('all');
    });
  }
  refresh(): void {
    if (this.loading()) return;
    const generation = this.scope.generation;
    this.loading.set(true);
    this.fetch = this.http.get<ApiResponse<readonly CustomerNotification[]>>(`${environment.apiBaseUrl}/notifications`, { withCredentials: true })
      .pipe(takeUntil(this.scope.changes), takeUntilDestroyed(this.destroyRef), finalize(() => { if (generation === this.scope.generation) this.loading.set(false); }))
      .subscribe({ next: response => {
        if (generation !== this.scope.generation) return;
        this.state.set(response.data); this.error.set('');
      }, error: () => { if (generation === this.scope.generation) this.error.set('Unable to load updates. Try again.'); } });
  }
  setReadStatus(status: NotificationReadStatus): void { this.statusFilter.set(status); }
  setCategory(category: NotificationCategory): void { this.categoryFilter.set(category); }
  private itemCategory(item: CustomerNotification): NotificationCategory {
    if (item.type) return notificationCategory(item.type);
    // Older API responses have no source type; only stable destination routes can classify them.
    const path = item.link.split('?')[0];
    if (/^\/my-bookings\/\d+\/payment\/?$/.test(path ?? '') || (path === '/book-event' && new URLSearchParams(item.link.split('?')[1]).has('paymentBooking'))) return 'payments';
    return path === '/my-bookings' || /^\/my-bookings\/\d+\/?$/.test(path ?? '') ? 'reservations' : 'system';
  }
  markRead(ids: readonly string[]): void {
    if (!ids.length) return;
    const generation = this.scope.generation;
    this.http.post(`${environment.apiBaseUrl}/notifications/read`, { ids }, { withCredentials: true })
      .pipe(takeUntil(this.scope.changes)).subscribe({ next: () => {
        if (generation === this.scope.generation) {
          this.fetch?.unsubscribe();
          this.state.update(items => items.map(item => ids.includes(item.id) ? { ...item, isRead: true } : item));
        }
      }, error: () => { if (generation === this.scope.generation) this.error.set('Unable to mark updates as read. Try again.'); } });
  }
  markAllRead(): void { this.markRead(this.items().filter(item => !item.isRead).map(item => item.id)); }
}
