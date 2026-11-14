import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAuthService } from './admin-auth.service';
import { AdminNotificationsService } from './admin-notifications.service';

const notification = { id: 'history:42', type: 'BOOKING', title: 'Reservation submitted', message: 'Review this reservation.', reference: 'LC-42', createdAt: '2026-11-14T02:30:00Z', isRead: false, link: '/admin/bookings/42' };
describe('AdminNotificationsService', () => {
  let service: AdminNotificationsService;
  let http: HttpTestingController;
  const user = signal<any>(null);
  let revision = 0;
  const getFeed = () => http.expectOne(request => request.url.endsWith('/admin/notifications'));
  const flushFeed = (unreadCount = 27) => getFeed().flush({ success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 61, totalPages: 4, unreadCount } });
  beforeEach(() => {
    vi.useFakeTimers(); user.set({ id: '7' }); revision = 1;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AdminAuthService, useValue: { user, get sessionVersion() { return revision; } } }] });
    service = TestBed.inject(AdminNotificationsService); http = TestBed.inject(HttpTestingController); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); http.verify(); vi.useRealTimers(); });
  it('uses the global unread count and fetches complete history through server pagination', () => {
    const request = getFeed();
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('unreadOnly')).toBe('false');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 61, totalPages: 4, unreadCount: 27 } });
    expect(service.unreadCount()).toBe(27);
    service.setPage(4);
    const last = getFeed(); expect(last.request.params.get('page')).toBe('4');
    last.flush({ success: true, data: { items: [], page: 4, pageSize: 20, totalItems: 61, totalPages: 4, unreadCount: 27 } });
    expect(service.page()).toBe(4); expect(service.unreadCount()).toBe(27);
    service.setUnreadOnly(true);
    const unread = getFeed(); expect(unread.request.params.get('page')).toBe('1'); expect(unread.request.params.get('unreadOnly')).toBe('true');
    unread.flush({ success: true, data: { items: [], page: 1, pageSize: 20, totalItems: 27, totalPages: 2, unreadCount: 27 } });
  });
  it('only acknowledges the opened item after success and cancels an older unread GET', () => {
    flushFeed(); service.refresh(); const stale = getFeed();
    service.markRead([notification.id]).subscribe();
    const read = http.expectOne(request => request.url.endsWith('/notifications/read'));
    expect(read.request.body).toEqual({ ids: ['history:42'] });
    expect(service.unreadCount()).toBe(27); expect(service.items()[0]?.isRead).toBe(false);
    read.flush({ success: true });
    expect(stale.cancelled).toBe(true); expect(service.items()[0]?.isRead).toBe(true); expect(service.unreadCount()).toBe(26);
    flushFeed(26);
  });
  it('retains unread state on failed acknowledgment and allows retry', () => {
    flushFeed(); service.markRead([notification.id]).subscribe();
    http.expectOne(request => request.url.endsWith('/notifications/read')).flush({}, { status: 500, statusText: 'Error' });
    expect(service.unreadCount()).toBe(27); expect(service.items()[0]?.isRead).toBe(false); expect(service.readError()).toBeTruthy();
    service.markRead([notification.id]).subscribe(); http.expectOne(request => request.url.endsWith('/notifications/read')).flush({ success: true });
    expect(service.readError()).toBe(''); flushFeed(26);
  });
  it('retains records and global counts during a failed refresh', () => {
    flushFeed(); service.refresh(); getFeed().flush({}, { status: 500, statusText: 'Error' });
    expect(service.items()).toHaveLength(1); expect(service.unreadCount()).toBe(27); expect(service.error()).toBeTruthy();
    service.refresh(); flushFeed(); expect(service.error()).toBe('');
  });
  it('keeps displayed filter and page metadata aligned with retained records during and after failed navigation', () => {
    flushFeed(); service.setUnreadOnly(true);
    expect(service.unreadOnly()).toBe(false); expect(service.page()).toBe(1);
    getFeed().flush({}, { status: 500, statusText: 'Error' });
    expect(service.unreadOnly()).toBe(false); expect(service.items()).toEqual([notification]); expect(service.totalItems()).toBe(61);
    service.setUnreadOnly(true);
    const retry = getFeed(); expect(retry.request.params.get('unreadOnly')).toBe('true');
    retry.flush({ success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 27, totalPages: 2, unreadCount: 27 } });
    expect(service.unreadOnly()).toBe(true); service.setPage(2); expect(service.page()).toBe(1);
    getFeed().flush({}, { status: 500, statusText: 'Error' });
    expect(service.page()).toBe(1); expect(service.totalItems()).toBe(27); expect(service.unreadOnly()).toBe(true);
    service.refresh(); const next = getFeed(); expect(next.request.params.get('page')).toBe('2');
    next.flush({ success: true, data: { items: [], page: 2, pageSize: 20, totalItems: 27, totalPages: 2, unreadCount: 27 } });
    expect(service.page()).toBe(2);
  });
  it('hides the old account immediately, cancels its requests and starts fresh for another admin', () => {
    flushFeed(); service.refresh(); const stale = getFeed();
    service.markRead([notification.id]).subscribe(); const read = http.expectOne(request => request.url.endsWith('/notifications/read'));
    revision++; user.set({ id: '8' });
    expect(service.items()).toEqual([]); expect(service.unreadCount()).toBe(0);
    TestBed.tick(); expect(stale.cancelled).toBe(true); expect(read.cancelled).toBe(true);
    flushFeed(2); expect(service.unreadCount()).toBe(2);
  });
  it('ignores responses from an old principal even before effect cleanup runs', () => {
    const stale = getFeed(); revision++; user.set({ id: '8' });
    stale.flush({ success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 1, totalPages: 1, unreadCount: 99 } });
    expect(service.items()).toEqual([]); expect(service.unreadCount()).toBe(0);
    TestBed.tick(); flushFeed(2);
  });
  it('ignores a late read acknowledgment after logout before effect cleanup runs', () => {
    flushFeed(); let opened = false;
    service.markRead([notification.id]).subscribe(success => { opened = success; });
    const pending = http.expectOne(request => request.url.endsWith('/notifications/read'));
    revision++; user.set(null); pending.flush({ success: true });
    expect(opened).toBe(false); expect(service.items()).toEqual([]); expect(service.unreadCount()).toBe(0);
    TestBed.tick(); http.expectNone(request => request.url.endsWith('/admin/notifications'));
  });
  it('cancels the previous filter request and corrects an unread page emptied by acknowledgment', () => {
    flushFeed(); service.setPage(4); const stale = getFeed();
    service.setUnreadOnly(true); expect(stale.cancelled).toBe(true);
    getFeed().flush({ success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 21, totalPages: 2, unreadCount: 21 } });
    service.setPage(2);
    getFeed().flush({ success: true, data: { items: [notification], page: 2, pageSize: 20, totalItems: 21, totalPages: 2, unreadCount: 21 } });
    service.markRead([notification.id]).subscribe(); http.expectOne(request => request.url.endsWith('/notifications/read')).flush({ success: true });
    getFeed().flush({ success: true, data: { items: [], page: 2, pageSize: 20, totalItems: 20, totalPages: 1, unreadCount: 20 } });
    const corrected = getFeed(); expect(corrected.request.params.get('page')).toBe('1');
    corrected.flush({ success: true, data: { items: [], page: 1, pageSize: 20, totalItems: 20, totalPages: 1, unreadCount: 20 } });
    expect(service.page()).toBe(1); expect(service.loading()).toBe(false);
  });
  it('polls and refreshes on focus only while authenticated, and tears down on destroy', () => {
    flushFeed(); vi.advanceTimersByTime(30_000); flushFeed();
    window.dispatchEvent(new Event('focus')); flushFeed();
    service.refresh(); const pending = getFeed(); revision++; user.set(null);
    expect(service.unreadCount()).toBe(0); TestBed.tick(); expect(pending.cancelled).toBe(true);
    vi.advanceTimersByTime(60_000); window.dispatchEvent(new Event('focus')); http.expectNone(request => request.url.endsWith('/admin/notifications'));
    user.set({ id: '9' }); revision++; TestBed.tick(); flushFeed();
    TestBed.resetTestingModule(); vi.advanceTimersByTime(60_000); window.dispatchEvent(new Event('focus')); http.expectNone(request => request.url.endsWith('/admin/notifications'));
  });
});

describe('AdminNotificationsService failed sign-out recovery', () => {
  it('recovers refresh and reads after logoutAll fails with the same authenticated user and a newer session version', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const auth = TestBed.inject(AdminAuthService); auth.user.set({ id: '7', fullName: 'Admin', email: 'admin@example.com', role: 'admin' } as any);
    const principal = auth.user(); const initialVersion = auth.sessionVersion;
    const service = TestBed.inject(AdminNotificationsService); const http = TestBed.inject(HttpTestingController); TestBed.tick();
    const feed = () => http.expectOne(request => request.url.endsWith('/admin/notifications'));
    const payload = { success: true, data: { items: [notification], page: 1, pageSize: 20, totalItems: 1, totalPages: 1, unreadCount: 1 } };
    feed().flush(payload); service.refresh(); const staleGet = feed();
    let staleOpened = false; service.markRead([notification.id]).subscribe(success => { staleOpened = success; });
    const staleRead = http.expectOne(request => request.url.endsWith('/notifications/read'));
    const failedLogout = auth.logoutAll().catch(() => undefined);
    http.expectOne(request => request.url.endsWith('/auth/admin/logout-all')).flush({}, { status: 500, statusText: 'Error' }); await failedLogout;
    expect(auth.user()).toBe(principal); expect(auth.sessionVersion).toBeGreaterThan(initialVersion);
    staleGet.flush({ ...payload, data: { ...payload.data, unreadCount: 99 } }); staleRead.flush({ success: true });
    expect(staleOpened).toBe(false);
    service.refresh(); feed().flush(payload);
    expect(service.loading()).toBe(false); expect(service.readingIds()).toEqual([]); expect(service.unreadCount()).toBe(1);
    let opened = false; service.markRead([notification.id]).subscribe(success => { opened = success; });
    http.expectOne(request => request.url.endsWith('/notifications/read')).flush({ success: true });
    expect(opened).toBe(true); feed().flush({ ...payload, data: { ...payload.data, items: [{ ...notification, isRead: true }], unreadCount: 0 } });
    expect(service.items()[0]?.isRead).toBe(true); expect(service.unreadCount()).toBe(0);
    TestBed.resetTestingModule(); http.verify();
  });
});
