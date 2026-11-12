import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../services/admin-auth.service';
import { AuthService } from '../services/auth.service';
import { apiInterceptor } from './api.interceptor';

describe('API session expiry', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let admin: AdminAuthService;
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    navigateByUrl.mockClear();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting(),
      { provide: Router, useValue: { url: '/my-bookings', navigateByUrl } },
    ] });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    admin = TestBed.inject(AdminAuthService);
    auth.user.set({ id: '42', fullName: 'Customer', email: 'customer@example.test', role: 'customer' });
    admin.user.set({ id: '7', fullName: 'Admin', email: 'admin@example.test', role: 'admin' });
  });
  afterEach(() => http.verify());

  it('does not extend idle time for background admin refreshes but retains session expiry handling', () => {
    const noteActivity = vi.spyOn(admin, 'noteActivity');
    client.get(`${environment.apiBaseUrl}/admin/dashboard`, { headers: { 'X-La-Chef-Background': '1' } }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/admin/dashboard`).flush({ success: true });
    expect(noteActivity).not.toHaveBeenCalled();
    client.get(`${environment.apiBaseUrl}/admin/dashboard`, { headers: { 'X-La-Chef-Background': '1' } }).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiBaseUrl}/admin/dashboard`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(admin.user()).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/admin/login', expect.objectContaining({ replaceUrl: true }));
  });

  it('adds CSRF protection to API writes including login and receipt uploads', () => {
    for (const body of [{}, new FormData()]) {
      client.post(`${environment.apiBaseUrl}/auth/login`, body).subscribe();
      const request = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
      expect(request.request.headers.get('X-La-Chef-Request')).toBe('1');
      expect(request.request.withCredentials).toBe(true);
      request.flush({});
    }
  });
  it('does not send CSRF headers or credentials to unrelated endpoints sharing a URL prefix', () => {
    client.post(`${environment.apiBaseUrl}-external/collect`, {}).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}-external/collect`);
    expect(request.request.headers.has('X-La-Chef-Request')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });

  it('expires only the customer session on a protected customer 401', () => {
    client.get(`${environment.apiBaseUrl}/bookings/my`).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiBaseUrl}/bookings/my`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(admin.user()?.id).toBe('7');
    expect(navigateByUrl).toHaveBeenCalledWith('/login', expect.objectContaining({ replaceUrl: true }));
  });

  it('expires only the administrator session on a protected admin 401', () => {
    client.get(`${environment.apiBaseUrl}/admin/bookings`).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiBaseUrl}/admin/bookings`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(admin.user()).toBeNull();
    expect(auth.user()?.id).toBe('42');
    expect(navigateByUrl).toHaveBeenCalledWith('/admin/login', expect.objectContaining({ replaceUrl: true }));
  });

  it('does not expire a session for an invalid password response', async () => {
    const result = auth.login('wrong@example.test', 'wrong-password');
    const rejected = expect(result).rejects.toMatchObject({ status: 401 });
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(auth.user()?.id).toBe('42');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('ignores an old account request failure after a new login succeeds', async () => {
    client.get(`${environment.apiBaseUrl}/bookings/my`).subscribe({ error: () => {} });
    const old = http.expectOne(`${environment.apiBaseUrl}/bookings/my`);
    const login = auth.login('other@example.test', 'other-password');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ success: true, data: {
      id: '99', fullName: 'Other', email: 'other@example.test', role: 'customer',
    } });
    await login;
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()?.id).toBe('99');
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
