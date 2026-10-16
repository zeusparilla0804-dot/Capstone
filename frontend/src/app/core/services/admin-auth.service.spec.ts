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
