import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('retries the server session check after an earlier failure', async () => {
    const firstCheck = service.ensureAuthenticated();
    http.expectOne(`${environment.apiBaseUrl}/auth/me`).flush(
      { success: false, message: 'Authentication required.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expect(firstCheck).resolves.toBe(false);

    const secondCheck = service.ensureAuthenticated();
    http.expectOne(`${environment.apiBaseUrl}/auth/me`).flush({
      success: true,
      data: {
        id: '42',
        fullName: 'LA Chef Customer',
        email: 'customer@example.com',
        role: 'customer',
      },
    });

    await expect(secondCheck).resolves.toBe(true);
    expect(service.user()?.id).toBe('42');
  });

  it('shares concurrent session checks', async () => {
    const firstCheck = service.ensureAuthenticated();
    const secondCheck = service.ensureAuthenticated();
    const requests = http.match(`${environment.apiBaseUrl}/auth/me`);

    expect(requests.length).toBe(1);
    requests[0].flush({
      success: true,
      data: {
        id: '7',
        fullName: 'Returning Customer',
        email: 'returning@example.com',
        role: 'customer',
      },
    });

    await expect(Promise.all([firstCheck, secondCheck])).resolves.toEqual([true, true]);
  });

  it('requests a customer password reset without credentials', async () => {
    const result = service.requestPasswordReset('customer@example.test');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/password/forgot`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'customer@example.test' });
    expect(request.request.withCredentials).toBe(false);
    request.flush({ success: true, message: 'If an account uses that email, password reset instructions will arrive shortly.' });
    await expect(result).resolves.toBeUndefined();
  });

  it('submits the complete customer reset body and propagates server errors', async () => {
    const result = service.resetPassword('selector.proof', 'new-password-123', 'new-password-123');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/password/reset`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      token: 'selector.proof',
      password: 'new-password-123',
      confirmPassword: 'new-password-123',
    });
    expect(request.request.withCredentials).toBe(false);
    request.flush({ success: false, message: 'This password reset link is invalid.', code: 'PASSWORD_RESET_INVALID' },
      { status: 400, statusText: 'Bad Request' });
    await expect(result).rejects.toMatchObject({ status: 400 });
  });
});
