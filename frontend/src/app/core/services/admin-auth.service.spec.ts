import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService password recovery', () => {
  let service: AdminAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps the admin signed in after eight hours without activity', async () => {
    vi.useFakeTimers();
    try {
      const login = service.login('admin@example.test', 'password');
      http.expectOne(`${environment.apiBaseUrl}/auth/admin/login`).flush({ success: true, data: { id: '7', role: 'admin' } });
      await login;
      vi.advanceTimersByTime(8 * 60 * 60_000);
      expect(service.user()?.id).toBe('7');
    } finally { vi.useRealTimers(); }
  });

  it('requires MFA completion before setting the admin user', async () => {
    const login = service.login('admin@example.test', 'password');
    http.expectOne(`${environment.apiBaseUrl}/auth/admin/login`).flush({ success: true,
      data: { requiresMfa: true, challenge: 'challenge-token', setupSecret: 'SETUPKEY' } });
    await expect(login).resolves.toEqual({ requiresMfa: true, challenge: 'challenge-token', setupSecret: 'SETUPKEY' });
    expect(service.user()).toBeNull();
    const completion = service.completeMfa('challenge-token', '123456');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/admin/mfa/complete`);
    expect(request.request.body).toEqual({ challenge: 'challenge-token', code: '123456' });
    request.flush({ success: true, data: { id: 7, role: 'admin', recoveryCodes: ['BACKUP'] } });
    await expect(completion).resolves.toEqual(['BACKUP']);
    expect(service.user()?.id).toBe('7');
  });

  it('clears a revoked administrator session when signing out', async () => {
    service.user.set({ id: '7', fullName: 'Admin', email: 'admin@example.test', role: 'admin' });
    const result = service.logout();
    http.expectOne(`${environment.apiBaseUrl}/auth/admin/logout`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).resolves.toBeUndefined();
    expect(service.user()).toBeNull();
  });

  it('requests an administrator password reset through the administrator endpoint', async () => {
    const result = service.requestPasswordReset('admin@example.test');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/admin/password/forgot`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'admin@example.test' });
    expect(request.request.withCredentials).toBe(false);
    request.flush({ success: true, message: 'If an account uses that email, password reset instructions will arrive shortly.' });
    await expect(result).resolves.toBeUndefined();
  });

  it('submits the administrator reset body and propagates the response', async () => {
    const result = service.resetPassword('selector.proof', 'new-password-123', 'new-password-123');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/admin/password/reset`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      token: 'selector.proof',
      password: 'new-password-123',
      confirmPassword: 'new-password-123',
    });
    expect(request.request.withCredentials).toBe(false);
    request.flush({ success: true, message: 'Your password has been changed. Please sign in again.' });
    await expect(result).resolves.toBeUndefined();
  });

  it('signs out every administrator session through the protected endpoint', async () => {
    const logoutAll = (service as unknown as { logoutAll?: () => Promise<void> }).logoutAll;
    expect(typeof logoutAll).toBe('function');
    const result = logoutAll!.call(service);
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/admin/logout-all`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
    await expect(result).resolves.toBeUndefined();
    expect(service.user()).toBeNull();
  });
});
