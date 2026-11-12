import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminLoginPage } from './admin-login.page';
const { renderQr } = vi.hoisted(() => ({ renderQr: vi.fn<(text: string, options: unknown) => Promise<string>>() }));

vi.mock('qrcode', () => ({ default: { toString: renderQr } }));

describe('AdminLoginPage', () => {
  let fixture: ComponentFixture<AdminLoginPage>;

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(async () => {
    vi.mocked(renderQr).mockReset();
    vi.mocked(renderQr).mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>');
    await TestBed.configureTestingModule({
      imports: [AdminLoginPage],
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { login: vi.fn(), completeMfa: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminLoginPage);
    fixture.detectChanges();
  });

  it('opens Operations Overview after sign-in even with a return URL', async () => {
    Object.defineProperty(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', {
      value: convertToParamMap({ returnUrl: '/admin/bookings' }), configurable: true,
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    expect(navigate).toHaveBeenCalledWith('/admin/dashboard');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it.each(['password', 'mfa', 'setup'])('opens a fresh dashboard document when %s sign-in cannot load the dashboard chunk', async (step) => {
    const reload = vi.fn();
    vi.stubGlobal('location', { assign: reload });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockRejectedValueOnce(
      new TypeError('Failed to fetch dynamically imported module: https://la-chef.online/old-dashboard.js'),
    );
    const component = fixture.componentInstance as any;
    if (step === 'password') {
      component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
      await component.submit();
    } else if (step === 'mfa') {
      component.challenge.set({ requiresMfa: true, challenge: 'pending' });
      component.code.setValue('123456');
      await component.verifyCode();
    } else {
      component.recoveryCodes.set(['recovery-code']);
      await component.finishSetup();
    }
    expect(component.error()).toBe('');
    expect(reload).toHaveBeenCalledExactlyOnceWith('/admin/dashboard');
  });

  it('does not navigate when administrator authentication fails', async () => {
    vi.mocked(TestBed.inject(AdminAuthService).login).mockRejectedValueOnce(new Error('Invalid credentials'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('Invalid administrator credentials.');
  });

  it('explains a backend connection failure without blaming the credentials', async () => {
    vi.mocked(TestBed.inject(AdminAuthService).login).mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    expect(component.error()).toBe('Cannot connect to the server. Please try again shortly.');
  });

  it('holds navigation for MFA and shows setup instructions', async () => {
    vi.mocked(TestBed.inject(AdminAuthService).login).mockResolvedValueOnce({
      requiresMfa: true, challenge: 'pending', setupSecret: 'SECRETKEY',
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('SECRETKEY');
    expect(component.form.controls.password.value).toBe('');
  });

  it.each([undefined, 'SETUPKEY'])('submits an MFA code without native navigation (setup key: %s)', async (setupSecret) => {
    const auth = TestBed.inject(AdminAuthService);
    vi.mocked(auth.login).mockResolvedValueOnce({ requiresMfa: true, challenge: 'pending', setupSecret });
    vi.mocked(auth.completeMfa).mockResolvedValueOnce(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#adminMfaCode') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(auth.completeMfa).toHaveBeenCalledExactlyOnceWith('pending', '123456');
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/admin/dashboard');
  });

  it('keeps the MFA challenge visible when verification fails without submitting a native form', async () => {
    const auth = TestBed.inject(AdminAuthService);
    vi.mocked(auth.login).mockResolvedValueOnce({ requiresMfa: true, challenge: 'pending' });
    vi.mocked(auth.completeMfa).mockRejectedValueOnce(new Error('Invalid code'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#adminMfaCode') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Invalid or expired code');
    expect(fixture.nativeElement.querySelector('#adminMfaCode')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows setup backup codes before allowing navigation to the dashboard', async () => {
    const auth = TestBed.inject(AdminAuthService);
    vi.mocked(auth.login).mockResolvedValueOnce({ requiresMfa: true, challenge: 'pending', setupSecret: 'SETUPKEY' });
    vi.mocked(auth.completeMfa).mockResolvedValueOnce(['0123456789ABCDEF0123']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#adminMfaCode') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Save your backup codes');
    expect(fixture.nativeElement.querySelector('.recovery-list').textContent).toContain('0123456789ABCDEF0123');
    expect(navigate).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.mfa-panel button').click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/admin/dashboard');
  });

  it('prevents a native submission for an invalid MFA code without contacting the API', async () => {
    const auth = TestBed.inject(AdminAuthService);
    vi.mocked(auth.login).mockResolvedValueOnce({ requiresMfa: true, challenge: 'pending' });
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();
    const event = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(auth.completeMfa).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a 6-digit code or 20-character backup code.');
  });

  it('renders a local QR code for the exact current authenticator setup URI', async () => {
    const setupUri = 'otpauth://totp/La%20Chef:admin%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=La%20Chef&algorithm=SHA1&digits=6&period=30';
    vi.mocked(TestBed.inject(AdminAuthService).login).mockResolvedValueOnce({
      requiresMfa: true, challenge: 'pending', setupSecret: 'JBSWY3DPEHPK3PXP', setupUri,
    });
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();

    expect(renderQr).toHaveBeenCalledExactlyOnceWith(setupUri, expect.objectContaining({ type: 'svg', margin: 4 }));
    const qr = fixture.nativeElement.querySelector('img.mfa-qr') as HTMLImageElement;
    expect(qr).not.toBeNull();
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(fixture.nativeElement.textContent).toContain('Scan a QR code');
    expect(fixture.nativeElement.querySelector('.setup-secret').textContent).toContain('JBSWY3DPEHPK3PXP');
    component.restart();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img.mfa-qr')).toBeNull();
    expect(component.setupQrCode()).toBe('');
  });

  it('retains manual setup if local QR generation fails', async () => {
    vi.mocked(renderQr).mockRejectedValueOnce(new Error('QR unavailable'));
    vi.mocked(TestBed.inject(AdminAuthService).login).mockResolvedValueOnce({
      requiresMfa: true, challenge: 'pending', setupSecret: 'JBSWY3DPEHPK3PXP', setupUri: 'otpauth://totp/test?secret=JBSWY3DPEHPK3PXP',
    });
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img.mfa-qr')).toBeNull();
    expect(fixture.nativeElement.querySelector('.setup-secret').textContent).toContain('JBSWY3DPEHPK3PXP');
    expect(component.challenge()).not.toBeNull();
    expect(component.error()).toBe('');
  });

  it('does not generate a setup QR code for an already enrolled administrator', async () => {
    vi.mocked(TestBed.inject(AdminAuthService).login).mockResolvedValueOnce({ requiresMfa: true, challenge: 'pending' });
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    fixture.detectChanges();

    expect(renderQr).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('img.mfa-qr')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Enter your verification code');
  });

  it('uses asterisks without changing the native password value or visibility toggle', () => {
    const password = fixture.nativeElement.querySelector('#adminPassword') as HTMLInputElement;
    password.value = 'Admin123';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(password.type).toBe('password');
    expect(password.value).toBe('Admin123');
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    expect(fixture.nativeElement.textContent).not.toContain('Admin123');
    (fixture.nativeElement.querySelector('.password-field__toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(password.type).toBe('text');
    expect(password.value).toBe('Admin123');
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
  });

  it('links administrator sign-in to administrator password recovery', () => {
    const link = fixture.nativeElement.querySelector('a[href="/admin/forgot-password"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Forgot password');
  });

  it('starts without application-supplied administrator credentials', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const identity = fixture.nativeElement.querySelector('#identity') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#adminPassword') as HTMLInputElement;

    expect(form.getAttribute('autocomplete')).toBe('on');
    expect(identity.value).toBe('');
    expect(identity.getAttribute('autocomplete')).toBe('username');
    expect(identity.placeholder).toBe('you@example.com');
    expect(password.value).toBe('');
    expect(password.placeholder).toBe('Enter your password');
    expect(password.type).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
  });

  it('uses the approved La Chef branding without legacy operations marketing', () => {
    const logo = fixture.nativeElement.querySelector('.admin-brand__logo') as HTMLImageElement | null;
    const brand = fixture.nativeElement.querySelector('.admin-brand') as HTMLElement;

    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('assets/brand/la-chef-admin-branding.jpeg');
    expect(brand.querySelectorAll('img')).toHaveLength(1);
    expect(brand.textContent).not.toContain('Every celebration');
    expect(brand.textContent).not.toContain('LA Chef operations');
    expect(brand.textContent).not.toContain('Authorized personnel only');
  });

  it('renders the approved admin sign-in controls and customer-site return action', () => {
    const heading = fixture.nativeElement.querySelector('#admin-login-title') as HTMLElement;
    const submit = fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement;
    const customerLink = fixture.nativeElement.querySelector(
      'a.admin-customer-link[href="/"]',
    ) as HTMLAnchorElement | null;

    expect(fixture.nativeElement.querySelector('.admin-login__eyebrow')?.textContent?.trim()).toBe(
      'Administration',
    );
    expect(heading.textContent?.trim()).toBe('Welcome');
    expect(
      fixture.nativeElement
        .querySelector('.admin-form-panel > p:not(.admin-login__eyebrow)')
        ?.textContent?.trim(),
    ).toBe('Sign in to manage La Chef operations.');
    expect(submit.textContent?.trim()).toBe('Sign in');
    expect(submit.textContent).not.toContain('→');
    expect(fixture.nativeElement.querySelector('.admin-divider')?.textContent?.trim()).toBe('or');
    expect(customerLink?.textContent?.trim()).toBe('Back to customer site');
    expect(fixture.nativeElement.querySelector('.admin-help')).toBeNull();
  });

  it('keeps native password masking and toggles password visibility accessibly', () => {
    const password = fixture.nativeElement.querySelector('#adminPassword') as HTMLInputElement;
    const toggle = fixture.nativeElement.querySelector(
      '.password-field__toggle',
    ) as HTMLButtonElement | null;

    expect(password.type).toBe('password');
    expect(toggle?.getAttribute('aria-label')).toBe('Show password');

    toggle?.click();
    fixture.detectChanges();

    expect(password.type).toBe('text');
    expect(toggle?.getAttribute('aria-label')).toBe('Hide password');
  });

  it('identifies required fields and explains an empty submission', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const identity = fixture.nativeElement.querySelector('#identity') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#adminPassword') as HTMLInputElement;
    const messages = Array.from(
      fixture.nativeElement.querySelectorAll('.field-error') as NodeListOf<HTMLElement>,
    ).map((element) => element.textContent?.trim());

    expect(identity.getAttribute('aria-invalid')).toBe('true');
    expect(identity.getAttribute('aria-describedby')).toBe('identity-error');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(password.getAttribute('aria-describedby')).toBe('password-error');
    expect(messages).toEqual(['Enter your email or username.', 'Enter your password.']);
  });
});
