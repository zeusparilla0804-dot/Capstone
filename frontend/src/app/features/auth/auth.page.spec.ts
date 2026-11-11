import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AuthPageComponent } from './auth.page';

describe('AuthPageComponent', () => {
  // jsdom does not implement the native dialog top layer; browser QA covers it.
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
  });
  afterAll(() => {
    for (const [name, descriptor] of [['showModal', originalShowModal], ['close', originalClose]] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  });
  it('requires email verification before navigating directly home', async () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    component.form.patchValue({ firstName: 'New', lastName: 'Customer', phone: '09171234567', email: 'new@example.test', password: 'new-password-123' });
    await component.submit();
    fixture.detectChanges();
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/verify-email?email=new%40example.test');
    expect(navigate).not.toHaveBeenCalledWith('/');
    expect(component.verificationMode()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-registration-success-dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-email-verification-form')).not.toBeNull();
    component.emailVerified(true); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(fixture.nativeElement.querySelector('app-registration-success-dialog')).toBeNull();
  });

  it('returns to sign-in after verification when a refreshed page cannot restore the pending password', () => {
    const component = fixture.componentInstance as any;
    component.emailVerified(false);
    expect(navigate).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('keeps registration errors on the form without opening a success dialog', async () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    component.form.patchValue({ firstName: 'New', lastName: 'Customer', phone: '09171234567', email: 'new@example.test', password: 'new-password-123' });
    auth.register.mockRejectedValueOnce(new Error('Registration failed'));
    await component.submit();
    fixture.detectChanges();
    expect(component.registerMode()).toBe(true);
    expect(component.error()).toBe('Unable to create your account.');
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-registration-success-dialog')).toBeNull();
  });

  it('blocks registration for invalid Philippine mobile numbers using the existing field feedback', async () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    component.form.patchValue({ firstName: 'New', lastName: 'Customer', email: 'new@example.test', password: 'new-password-123' });
    for (const phone of ['09999999999999999999999', '', '0917123456', '091712345678', '08171234567', '+6391712345678', '0917abc4567', '02 8123 4567']) {
      component.form.controls.phone.setValue(phone);
      await component.submit();
      fixture.detectChanges();
      expect(component.form.controls.phone.invalid, phone).toBe(true);
      expect(auth.register).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#phone-feedback')?.textContent).toContain('Enter a valid Philippine mobile number');
      expect(fixture.nativeElement.querySelector('app-registration-success-dialog')).toBeNull();
    }
    component.form.controls.phone.setValue('09171234567');
    fixture.detectChanges();
    expect(component.form.controls.phone.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('#phone-feedback')?.textContent.trim()).toBe('');
  });

  it('accepts local and international Philippine mobile numbers with the displayed spacing', () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    for (const phone of ['09171234567', '+639171234567', '0917 123 4567', '+63917 123 4567']) {
      component.form.controls.phone.setValue(phone);
      expect(component.form.controls.phone.valid, phone).toBe(true);
    }
  });

  it('rejects short registration emails and obvious dummy mobile numbers before sending', async () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    component.form.patchValue({ firstName: 'New', lastName: 'Customer', email: 'q@gmail.com', phone: '09171234567', password: 'new-password-123' });
    await component.submit();
    expect(component.form.controls.email.invalid).toBe(true);
    expect(auth.register).not.toHaveBeenCalled();
    component.form.controls.email.setValue('klint@gmail.com');
    component.form.controls.phone.setValue('09123456789');
    await component.submit();
    expect(component.form.controls.phone.invalid).toBe(true);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('reserves registration feedback space while allowing multiline errors to grow', () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const feedback = root.querySelector<HTMLElement>('#phone-feedback')!;
    const error = root.querySelector<HTMLElement>('.auth-error--slot')!;
    expect(feedback.textContent?.trim()).toBe('');
    expect(getComputedStyle(feedback).minHeight).toBe('1rem');
    expect(getComputedStyle(error).minHeight).toBe('1rem');

    component.form.controls.phone.markAsTouched();
    component.error.set('Your account could not be created. Please check your details and try again.');
    fixture.detectChanges();

    expect(feedback.textContent).toContain('Enter a valid Philippine mobile number');
    for (const message of [feedback, error]) {
      expect(getComputedStyle(message).height).toBe('auto');
      expect(getComputedStyle(message).overflow).toBe('visible');
    }
  });

  it('prevents duplicate submissions while registering and while confirmation is open', async () => {
    const component = fixture.componentInstance as any;
    component.toggle();
    component.form.patchValue({ firstName: 'New', lastName: 'Customer', phone: '09171234567', email: 'new@example.test', password: 'new-password-123' });
    let resolve!: () => void;
    auth.register.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const pending = component.submit();
    component.toggle();
    expect(component.registerMode()).toBe(true);
    await component.submit();
    expect(auth.register).toHaveBeenCalledTimes(1);
    resolve();
    await pending;
    await component.submit();
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
  });

  let fixture: ComponentFixture<AuthPageComponent>;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof signal<null>>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    auth = {
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
      user: signal(null),
    };
    await TestBed.configureTestingModule({
      imports: [AuthPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AuthPageComponent);
    fixture.detectChanges();
  });

  it('signs in with email and password without validating hidden registration fields', async () => {
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue(value: string): void };
          password: { setValue(value: string): void };
        };
      };
      submit(): Promise<void>;
    };
    component.form.controls.email.setValue('customer@example.test');
    component.form.controls.password.setValue('short123');

    await component.submit();

    expect(auth.login).toHaveBeenCalledWith('customer@example.test', 'short123');
    expect(auth.register).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('opens the landing page after sign-in even with a return URL', async () => {
    Object.defineProperty(TestBed.inject(ActivatedRoute).snapshot, 'queryParamMap', {
      value: convertToParamMap({ returnUrl: '/book-event' }), configurable: true,
    });
    const component = fixture.componentInstance as any;
    component.form.patchValue({ email: 'customer@example.test', password: 'short123' });
    await component.submit();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when customer authentication fails', async () => {
    auth.login.mockRejectedValueOnce(new Error('Invalid credentials'));
    const component = fixture.componentInstance as any;
    component.form.patchValue({ email: 'customer@example.test', password: 'short123' });
    await component.submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toBe('Invalid email or password.');
  });

  it('links customer sign-in to customer password recovery', () => {
    const link = fixture.nativeElement.querySelector('a[href="/forgot-password"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Forgot password');
  });

  it('does not show administrator access on customer sign-in', () => {
    expect(fixture.nativeElement.querySelector('a[href="/admin/login"]')).toBeNull();
  });
  it('returns an unverified customer to code entry without treating the login as successful', async () => {
    const component = fixture.componentInstance as any;
    component.form.patchValue({ email: 'new@example.test', password: 'new-password-123' });
    auth.login.mockRejectedValueOnce(new HttpErrorResponse({ status: 403, error: { code: 'EMAIL_NOT_VERIFIED' } }));
    await component.submit(); fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith('/verify-email?email=new%40example.test');
    expect(component.form.controls.password.value).toBe('');
    expect(component.registrationSucceeded()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(fixture.nativeElement.querySelector('#auth-title')?.textContent).toContain('Verify your email');
  });
  it('resumes code entry after refreshing the verification route', () => {
    const route = TestBed.inject(ActivatedRoute) as any;
    route.snapshot.data = { verifyEmail: true };
    route.snapshot.queryParamMap = convertToParamMap({ email: 'pending@example.test' });
    const refreshed = TestBed.createComponent(AuthPageComponent); refreshed.detectChanges();
    expect(refreshed.nativeElement.querySelector('#verification-email').value).toBe('pending@example.test');
    expect(refreshed.nativeElement.querySelector('#password')).toBeNull();
    expect(refreshed.nativeElement.querySelector('a[href="/admin/login"]')).toBeNull();
    refreshed.destroy();
  });

  it('keeps the approved login card styling without depending on an administrator link', () => {
    const root = fixture.nativeElement as HTMLElement;
    const page = root.querySelector('.auth-page')!;
    const shell = root.querySelector('.auth-shell')!;
    expect(getComputedStyle(page).display).toBe('grid');
    expect(getComputedStyle(shell).borderRadius).toBe('15px');
    expect(getComputedStyle(shell).gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)');
    expect(root.querySelector('.auth-panel')?.classList.contains('auth-panel--login')).toBe(true);

    root.querySelector<HTMLButtonElement>('.auth-switch__button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.auth-panel')?.classList.contains('auth-panel--login')).toBe(false);
    expect(root.querySelector('.auth-shell--register')).not.toBeNull();
  });

  it('starts without application-supplied customer credentials', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;

    expect(form.getAttribute('autocomplete')).toBe('on');
    expect(email.value).toBe('');
    expect(email.placeholder).toBe('you@example.com');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(password.value).toBe('');
    expect(password.placeholder).toBe('Enter your password');
    expect(password.type).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
  });

  it('shows only asterisks while retaining a native password input and its real value', () => {
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    password.value = 'Secret123';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(password.type).toBe('password');
    expect(password.value).toBe('Secret123');
    const mask = fixture.nativeElement.querySelector('.password-field__mask') as HTMLElement;
    expect(mask?.textContent).toBe('*********');
    expect(mask?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.textContent).not.toContain('Secret123');

    const toggle = fixture.nativeElement.querySelector('.password-field button') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges();
    expect(password.type).toBe('text');
    expect(password.value).toBe('Secret123');
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
    toggle.click(); fixture.detectChanges();
    expect(password.type).toBe('password');
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('*********');

    password.value = 'Se';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('**');
    expect((fixture.componentInstance as any).form.controls.password.value).toBe('Se');
    password.value = '';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
  });

  it('accepts an eight-character registration password and rejects shorter values', () => {
    (fixture.nativeElement.querySelector('.auth-switch__button') as HTMLButtonElement).click();
    const component = fixture.componentInstance as any;
    component.form.controls.password.setValue('seven77');
    expect(component.form.controls.password.hasError('minlength')).toBe(true);
    component.form.controls.password.setValue('Secret82');
    fixture.detectChanges();
    expect(component.form.controls.password.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    expect(fixture.nativeElement.textContent).toContain('at least 8 characters');
  });

  it('uses asterisk masking for registration with one custom visibility toggle', () => {
    const component = fixture.componentInstance as unknown as {
      form: { controls: { password: { setValue(value: string): void } } };
    };
    const accountButton = fixture.nativeElement.querySelector(
      '.auth-switch__button',
    ) as HTMLButtonElement;
    accountButton.click();
    component.form.controls.password.setValue('Secret123456');
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    const visibilityButtons = fixture.nativeElement.querySelectorAll('.password-field button');

    expect(password.type).toBe('password');
    expect(password.value).toBe('Secret123456');
    expect(password.placeholder).toBe('Enter your password');
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('************');
    expect(visibilityButtons).toHaveLength(1);

    password.setSelectionRange(2, 8);
    expect(password.selectionStart).toBe(2);
    expect(password.selectionEnd).toBe(8);

    const visibilityButton = visibilityButtons[0] as HTMLButtonElement;
    visibilityButton.click();
    fixture.detectChanges();

    expect(password.type).toBe('text');
    expect(password.value).toBe('Secret123456');
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
  });

  it('uses the approved split login composition', () => {
    const shell = fixture.nativeElement.querySelector('.auth-shell') as HTMLElement;
    const brandLogo = fixture.nativeElement.querySelector('.auth-brand__logo') as HTMLImageElement;
    const heading = fixture.nativeElement.querySelector('#auth-title') as HTMLElement;
    const accountButton = fixture.nativeElement.querySelector(
      '.auth-switch__button',
    ) as HTMLButtonElement;

    expect(shell).not.toBeNull();
    expect(brandLogo.getAttribute('src')).toBe('assets/brand/la-chef-admin-branding.jpeg');
    expect(fixture.nativeElement.querySelectorAll('.auth-brand img')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.auth-brand__rule')).toBeNull();
    expect(fixture.nativeElement.querySelector('.auth-brand p')).toBeNull();
    expect(fixture.nativeElement.querySelector('.auth-brand .auth-ornament')).toBeNull();
    expect(heading.textContent?.trim()).toBe('Sign in to La Chef');
    expect(accountButton.textContent?.trim()).toBe('Create an account');
    expect(fixture.nativeElement.querySelector('.auth-divider')?.textContent?.trim()).toBe('or');
    expect(fixture.nativeElement.querySelector('form > .btn [aria-hidden="true"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.auth-brand ul')).toBeNull();
  });

  it('matches the customer login panel to the final logo background', () => {
    const brandPanel = fixture.nativeElement.querySelector('.auth-brand') as HTMLElement;

    expect(getComputedStyle(brandPanel).backgroundColor).toBe('rgb(16, 15, 11)');
  });

  it('omits decorative ornaments while keeping the registration label', () => {
    const ornaments = fixture.nativeElement.querySelectorAll('.auth-ornament');

    expect(fixture.nativeElement.querySelector('.auth-eyebrow')).toBeNull();
    expect(ornaments.length).toBe(0);
    expect(fixture.nativeElement.querySelector('.auth-ornament--right')).toBeNull();

    const accountButton = fixture.nativeElement.querySelector(
      '.auth-switch__button',
    ) as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();

    const registrationEyebrow = fixture.nativeElement.querySelector('.auth-eyebrow') as HTMLElement;
    expect(registrationEyebrow.textContent?.trim()).toBe('Create account');
  });

  it('presents the complete customer registration form with helpful field cues', () => {
    const accountButton = fixture.nativeElement.querySelector(
      '.auth-switch__button',
    ) as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();

    const firstName = fixture.nativeElement.querySelector('#firstName') as HTMLInputElement;
    const lastName = fixture.nativeElement.querySelector('#lastName') as HTMLInputElement;
    const phone = fixture.nativeElement.querySelector('#phone') as HTMLInputElement;
    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    const phoneField = phone.closest('.auth-input') as HTMLElement | null;

    expect(firstName.placeholder).toBe('First name');
    expect(lastName.placeholder).toBe('Last name');
    expect(phone.placeholder).toBe('e.g. 0912 345 6789');
    expect(email.placeholder).toBe('you@example.com');
    expect(password.placeholder).toBe('Enter your password');
    expect(phoneField).not.toBeNull();
    expect(phoneField?.querySelector('svg')).not.toBeNull();
    expect(firstName.value).toBe('');
    expect(lastName.value).toBe('');
    expect(phone.value).toBe('');
    expect(email.value).toBe('');
    expect(password.value).toBe('');
  });

  it('clears sign-in credentials before showing the customer registration form', () => {
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue(value: string): void };
          password: { setValue(value: string): void };
        };
      };
    };
    component.form.controls.email.setValue('admin@lachef.com');
    component.form.controls.password.setValue('admin-password');
    fixture.detectChanges();

    const accountButton = fixture.nativeElement.querySelector(
      '.auth-switch__button',
    ) as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();

    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;

    expect(email.value).toBe('');
    expect(email.placeholder).toBe('you@example.com');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(password.value).toBe('');
    expect(password.type).toBe('password');
    expect(password.placeholder).toBe('Enter your password');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
  });
});
