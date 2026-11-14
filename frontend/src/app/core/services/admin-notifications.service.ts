import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { catchError, finalize, fromEvent, interval, map, merge, Observable, of, Subject, Subscription, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse } from '../models';
import type { AdminNotificationPage } from '../models/admin-notification.model';
import { AdminAuthService } from './admin-auth.service';

const emptyPage: AdminNotificationPage = { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, unreadCount: 0 };

@Injectable({ providedIn: 'root' })
export class AdminNotificationsService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AdminAuthService);
  private readonly scope = signal<{ user: ReturnType<AdminAuthService['user']>; version: number }>({ user: null, version: -1 });
  private get owner() { return this.scope().user; }
  private get version() { return this.scope().version; }
  private readonly state = signal(emptyPage);
  private readonly pending = signal(false);
  private readonly refreshFailure = signal('');
  private readonly readFailure = signal('');
  private readonly unreadFilter = signal(false);
  private requestedPage = 1;
  private requestedUnreadOnly = false;
  private readonly reading = signal<readonly string[]>([]);
  private readonly bulkRead = signal(false);
  private readonly scopeChanges = new Subject<void>();
  private fetch?: Subscription;
  private requestVersion = 0;
  private readonly current = computed(() => {
    const user = this.auth.user();
    return user !== null && user === this.owner && this.auth.sessionVersion === this.version;
  });
  private readonly pageState = computed(() => this.current() ? this.state() : emptyPage);
  readonly items = computed(() => this.pageState().items);
  readonly unreadCount = computed(() => this.pageState().unreadCount);
  readonly page = computed(() => this.pageState().page);
  readonly pageSize = computed(() => this.pageState().pageSize);
  readonly totalItems = computed(() => this.pageState().totalItems);
  readonly totalPages = computed(() => this.pageState().totalPages);
  readonly unreadOnly = computed(() => this.current() && this.unreadFilter());
  readonly loading = computed(() => this.current() && this.pending());
  readonly error = computed(() => this.current() ? this.refreshFailure() : '');
  readonly readError = computed(() => this.current() ? this.readFailure() : '');
  readonly readingIds = computed(() => this.current() ? this.reading() : []);
  readonly markingAll = computed(() => this.current() && this.bulkRead());

  constructor() {
    effect(onCleanup => {
      const user = this.auth.user();
      untracked(() => {
        this.scope.set({ user, version: this.auth.sessionVersion });
        this.state.set({ ...emptyPage }); this.pending.set(false); this.refreshFailure.set('');
        this.readFailure.set(''); this.unreadFilter.set(false); this.reading.set([]); this.bulkRead.set(false);
        this.requestedPage = 1; this.requestedUnreadOnly = false;
        if (!user || !this.http) return;
        this.refresh();
      });
      const polling = user && this.http && typeof window !== 'undefined'
        ? merge(interval(30_000), fromEvent(window, 'focus')).subscribe(() => this.refresh()) : undefined;
      onCleanup(() => {
        polling?.unsubscribe(); this.cancelFetch(); this.scopeChanges.next();
      });
    });
  }

  refresh(): void {
    if (!this.prepareScope() || !this.http || this.pending() || this.bulkRead()) return;
    const user = this.owner; const version = this.version; const requestVersion = ++this.requestVersion;
    const unreadOnly = this.requestedUnreadOnly;
    this.pending.set(true);
    this.fetch = this.http.get<ApiResponse<AdminNotificationPage>>(`${environment.apiBaseUrl}/admin/notifications`, {
      withCredentials: true, headers: { 'X-La-Chef-Background': '1' },
      params: { page: this.requestedPage, pageSize: 20, unreadOnly },
    }).pipe(finalize(() => {
      if (this.isCurrent(user, version) && requestVersion === this.requestVersion) this.pending.set(false);
    })).subscribe({
      next: response => {
        if (!this.isCurrent(user, version) || requestVersion !== this.requestVersion) return;
        this.state.set(response.data); this.unreadFilter.set(unreadOnly); this.refreshFailure.set('');
        this.requestedPage = response.data.page;
        // An acknowledged item may remove the final record from an Unread page.
        if (response.data.page > Math.max(1, response.data.totalPages)) this.setPage(Math.max(1, response.data.totalPages));
      },
      error: () => {
        if (this.isCurrent(user, version) && requestVersion === this.requestVersion)
          this.refreshFailure.set('Unable to refresh notifications. Displayed records are from the last successful refresh. Try again.');
      },
    });
  }

  setPage(page: number): void {
    if (!this.prepareScope() || !Number.isInteger(page) || page < 1 || page > Math.max(1, this.totalPages())) return;
    this.cancelFetch(); this.requestedPage = page; this.requestedUnreadOnly = this.unreadFilter(); this.refresh();
  }

  setUnreadOnly(unreadOnly: boolean): void {
    if (!this.prepareScope() || (this.requestedUnreadOnly === unreadOnly && this.pending())) return;
    this.cancelFetch(); this.requestedUnreadOnly = unreadOnly; this.requestedPage = 1; this.refresh();
  }

  markRead(ids: readonly string[]): Observable<boolean> {
    const keys = [...new Set(ids)];
    if (!this.prepareScope() || !this.http || this.bulkRead() || !keys.length || keys.length > 50 || keys.some(id => this.reading().includes(id))) return of(false);
    const user = this.owner; const version = this.version;
    this.reading.update(current => [...current, ...keys]); this.readFailure.set('');
    return this.http.post<{ success: boolean }>(`${environment.apiBaseUrl}/admin/notifications/read`, { ids: keys }, { withCredentials: true }).pipe(
      takeUntil(this.scopeChanges),
      map(response => {
        if (!this.isCurrent(user, version) || !response.success) throw new Error('Read not acknowledged');
        this.cancelFetch();
        this.state.update(state => ({ ...state,
          unreadCount: Math.max(0, state.unreadCount - state.items.filter(item => keys.includes(item.id) && !item.isRead).length),
          items: state.items.map(item => keys.includes(item.id) ? { ...item, isRead: true } : item),
        }));
        this.readFailure.set(''); this.refresh(); return true;
      }),
      catchError(() => {
        if (this.isCurrent(user, version)) this.readFailure.set('Unable to open this notification. Try opening it again.');
        return of(false);
      }),
      finalize(() => {
        if (this.isCurrent(user, version)) this.reading.update(current => current.filter(id => !keys.includes(id)));
      }),
    );
  }

  private isCurrent(user = this.owner, version = this.version): boolean {
    return user !== null && this.auth.user() === user && this.auth.sessionVersion === version;
  }

  markAllRead(): Observable<boolean> {
    if (!this.prepareScope() || !this.http || this.bulkRead() || this.reading().length) return of(false);
    const user = this.owner; const version = this.version;
    this.cancelFetch(); this.bulkRead.set(true); this.readFailure.set('');
    return this.http.post<{ success: boolean }>(`${environment.apiBaseUrl}/admin/notifications/read-all`, {}, { withCredentials: true }).pipe(
      takeUntil(this.scopeChanges),
      map(response => {
        if (!this.isCurrent(user, version) || !response.success) throw new Error('Read not acknowledged');
        this.state.update(state => ({ ...state, unreadCount: 0, items: state.items.map(item => ({ ...item, isRead: true })) }));
        this.bulkRead.set(false); this.requestedPage = 1; this.refresh(); return true;
      }),
      catchError(() => {
        if (this.isCurrent(user, version)) this.readFailure.set('Unable to mark notifications as read. Please try again.');
        return of(false);
      }),
      finalize(() => { if (this.isCurrent(user, version)) this.bulkRead.set(false); }),
    );
  }

  private prepareScope(): boolean {
    const user = this.auth.user();
    // A failed sign-out increments the auth revision but retains the principal.
    // Cancel work from that revision and let the authenticated account recover.
    if (user !== null && user === this.owner && this.auth.sessionVersion !== this.version) {
      this.cancelFetch(); this.scopeChanges.next(); this.reading.set([]); this.readFailure.set(''); this.bulkRead.set(false);
      this.scope.set({ user, version: this.auth.sessionVersion });
    }
    return this.isCurrent();
  }

  private cancelFetch(): void {
    this.requestVersion++; this.fetch?.unsubscribe(); this.pending.set(false);
  }
}
