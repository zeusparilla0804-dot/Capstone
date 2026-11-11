import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

describe('AuthService', () => {
  it('verifies an email code without authenticating and preserves leading zeroes', async () => {
    const result = service.verifyEmail('customer@example.test', '012345');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/email/verify`);
    expect(request.request.body).toEqual({ email: 'customer@example.test', code: '012345' });
    request.flush({ success: true }); await result;
    expect(service.user()).toBeNull();
  });
  it('requests a replacement email code without creating a session', async () => {
    const result = service.resendEmailCode('customer@example.test');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/email/resend`);
    expect(request.request.body).toEqual({ email: 'customer@example.test' });
    request.flush({ success: true }); await result;
    expect(service.user()).toBeNull();
  });
  it('updates the signed-in customer phone through a credentialed request and refreshes account state', async () => {
    const result = (service as any).updatePhone('0917 123 4567');
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/me/phone`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ phone: '0917 123 4567' });
    request.flush({ success: true, data: { id: 42, fullName: 'New Customer', email: 'new@example.test', phone: '09171234567', role: 'customer' } });
    await result;
    expect(service.user()?.phone).toBe('09171234567');
    expect(service.user()?.id).toBe('42');
  });

  it('preserves the displayed phone when saving fails', async () => {
    const user = { id: '42', fullName: 'New Customer', email: 'new@example.test', phone: '09171234567', role: 'customer' as const };
    service.user.set(user);
    const result = (service as any).updatePhone('09181234567');
    const rejection = expect(result).rejects.toMatchObject({ status: 400 });
    http.expectOne(`${environment.apiBaseUrl}/auth/me/phone`).flush({ success: false, message: 'Invalid phone.' }, { status: 400, statusText: 'Bad Request' });
    await rejection;
    expect(service.user()).toEqual(user);
  });

  it('creates an account without authenticating the customer', async () => {
    const result = service.register({ firstName: 'New', lastName: 'Customer', phone: '09171234567', email: 'new@example.test', password: 'new-password-123' });
    http.expectOne(`${environment.apiBaseUrl}/auth/register`).flush({ success: true, data: { id: 42, fullName: 'New Customer', email: 'new@example.test', role: 'customer' } });
    await result;
    http.expectNone(`${environment.apiBaseUrl}/auth/logout`);
    expect(service.user()).toBeNull();
  });

  it('replaces the previous customer with the newly verified account before returning home', async () => {
    service.user.set({ id: '7', fullName: 'Michael Escalera', email: 'michael@example.test', role: 'customer' });
    const registration = service.register({ firstName: 'Klint', lastName: 'Fajardo', phone: '09171234567', email: 'klint@example.test', password: 'new-password-123' });
    http.expectOne(`${environment.apiBaseUrl}/auth/register`).flush({ success: true, data: { id: 42, fullName: 'Klint Fajardo', email: 'klint@example.test', role: 'customer' } });
    await Promise.resolve();
    http.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush(null);
    await registration;
    expect(service.user()).toBeNull();
    const verification = service.verifyEmail('klint@example.test', '012345');
    http.expectOne(`${environment.apiBaseUrl}/auth/email/verify`).flush({ success: true });
    await Promise.resolve();
    const login = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(login.request.body).toEqual({ email: 'klint@example.test', password: 'new-password-123' });
    login.flush({ success: true, data: { id: 42, fullName: 'Klint Fajardo', email: 'klint@example.test', role: 'customer' } });
    await expect(verification).resolves.toBe(true);
    expect(service.user()?.fullName).toBe('Klint Fajardo');
    expect(service.user()?.id).toBe('42');
  });

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

  it('invalidates customer stores before publishing the changed account identity', async () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    const seen: (string | null)[] = [];
    scope.changes.subscribe(() => seen.push(service.user()?.id ?? null));
    const login = service.login('customer@example.test', 'password-12345');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ success: true, data: {
      id: 42, fullName: 'Customer', email: 'customer@example.test', role: 'customer',
    } });
    await login;
    const logout = service.logout();
    http.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush(null);
    await logout;
    expect(seen).toEqual([null, '42']);
    expect(scope.generation).toBe(2);
  });

  it('treats an already revoked session as a successful local logout', async () => {
    service.user.set({ id: '42', fullName: 'Customer', email: 'customer@example.test', role: 'customer' });
    const result = service.logout();
    http.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(result).resolves.toBeUndefined();
    expect(service.user()).toBeNull();
  });

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

  it('keeps an earlier session discovery from winning over an intentional login', async () => {
    const check = service.ensureAuthenticated();
    const prior = http.expectOne(`${environment.apiBaseUrl}/auth/me`);
    const login = service.login('other@example.test', 'password-12345');
    prior.flush({ success: true, data: { id: '42', fullName: 'Prior', email: 'prior@example.test', role: 'customer' } });
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ success: true, data: {
      id: '99', fullName: 'Other', email: 'other@example.test', role: 'customer',
    } });
    await Promise.all([check, login]);
    expect(service.user()?.id).toBe('99');
  });

  it('does not let an earlier session discovery prevent local logout', async () => {
    const check = service.ensureAuthenticated();
    const prior = http.expectOne(`${environment.apiBaseUrl}/auth/me`);
    const logout = service.logout();
    prior.flush({ success: true, data: { id: '42', fullName: 'Prior', email: 'prior@example.test', role: 'customer' } });
    http.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush(null);
    await Promise.all([check, logout]);
    expect(service.user()).toBeNull();
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

  it('signs out every customer session through the protected endpoint', async () => {
    const logoutAll = (service as unknown as { logoutAll?: () => Promise<void> }).logoutAll;
    expect(typeof logoutAll).toBe('function');
    const result = logoutAll!.call(service);
    const request = http.expectOne(`${environment.apiBaseUrl}/auth/logout-all`);
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
    await expect(result).resolves.toBeUndefined();
    expect(service.user()).toBeNull();
  });
});
