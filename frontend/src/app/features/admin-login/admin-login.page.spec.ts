import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminLoginPage } from './admin-login.page';

describe('AdminLoginPage', () => {
  let fixture: ComponentFixture<AdminLoginPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLoginPage],
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { login: vi.fn() } },
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

  it('does not navigate when administrator authentication fails', async () => {
    vi.mocked(TestBed.inject(AdminAuthService).login).mockRejectedValueOnce(new Error('Invalid credentials'));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ identity: 'admin@example.test', password: 'password' });
    await component.submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('Invalid administrator credentials.');
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
