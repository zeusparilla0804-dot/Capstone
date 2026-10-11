import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AuthService } from '../../core/services/auth.service';
import { PasswordRecoveryPage } from './password-recovery.page';

describe('PasswordRecoveryPage', () => {
  let fixture: ComponentFixture<PasswordRecoveryPage>;
  let customer: {
    requestPasswordReset: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof signal<null>>;
  };
  let admin: { requestPasswordReset: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };
  let router: Router;
  let route: ActivatedRoute;

  async function setup(audience: 'customer' | 'admin', mode: 'forgot' | 'reset', token?: string) {
    customer = {
      requestPasswordReset: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
      user: signal(null),
    };
    admin = { requestPasswordReset: vi.fn().mockResolvedValue(undefined), resetPassword: vi.fn().mockResolvedValue(undefined) };
    const routeValue = {
      snapshot: {
        data: { audience, mode },
        queryParamMap: convertToParamMap(token === undefined ? {} : { token }),
      },
    };
    await TestBed.configureTestingModule({
      imports: [PasswordRecoveryPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: customer },
        { provide: AdminAuthService, useValue: admin },
        { provide: ActivatedRoute, useValue: routeValue },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PasswordRecoveryPage);
    router = TestBed.inject(Router);
    route = TestBed.inject(ActivatedRoute);
    fixture.detectChanges();
    return fixture.componentInstance as any;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('validates email and shows the same generic sent state for customer recovery', async () => {
    const component = await setup('customer', 'forgot');
    await component.submitForgot();
    expect(customer.requestPasswordReset).not.toHaveBeenCalled();
    expect(component.forgotForm.controls.email.touched).toBe(true);

    component.forgotForm.controls.email.setValue('not-an-email');
    await component.submitForgot();
    expect(customer.requestPasswordReset).not.toHaveBeenCalled();

    component.forgotForm.controls.email.setValue('customer@example.test');
    await component.submitForgot();
    fixture.detectChanges();
    expect(customer.requestPasswordReset).toHaveBeenCalledWith('customer@example.test');
    expect(admin.requestPasswordReset).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('If an LA Chef account uses that email');
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('selects the administrator service and prevents duplicate forgot submissions', async () => {
    let release!: () => void;
    const component = await setup('admin', 'forgot');
    admin.requestPasswordReset.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    component.forgotForm.controls.email.setValue('admin@example.test');

    const first = component.submitForgot();
    const second = component.submitForgot();
    expect(admin.requestPasswordReset).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(true);
    release();
    await Promise.all([first, second]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/admin/login"]')).not.toBeNull();
  });

  it('blocks reset when the token is missing and never renders a token value', async () => {
    const component = await setup('customer', 'reset');
    component.resetForm.setValue({ password: 'new-password-123', confirmPassword: 'new-password-123' });
    await component.submitReset();
    fixture.detectChanges();
    expect(customer.resetPassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('This password reset link is invalid');
    expect(fixture.nativeElement.innerHTML).not.toContain('selector.proof');
  });

  it('validates 12-128 character matching passwords before reset dispatch', async () => {
    const component = await setup('customer', 'reset', 'selector.proof');
    for (const values of [
      { password: 'short', confirmPassword: 'short' },
      { password: 'a'.repeat(129), confirmPassword: 'a'.repeat(129) },
      { password: 'new-password-123', confirmPassword: 'different-password' },
    ]) {
      component.resetForm.setValue(values);
      await component.submitReset();
    }
    expect(customer.resetPassword).not.toHaveBeenCalled();
  });

  it('maps invalid reset links safely and offers the audience-specific request route', async () => {
    const failure = new HttpErrorResponse({ status: 400, error: { code: 'PASSWORD_RESET_INVALID' } });
    admin.resetPassword.mockRejectedValue(failure);
    const component = await setup('admin', 'reset', 'selector.proof');
    admin.resetPassword.mockRejectedValue(failure);
    component.resetForm.setValue({ password: 'new-password-123', confirmPassword: 'new-password-123' });
    await component.submitReset();
    fixture.detectChanges();

    expect(admin.resetPassword).toHaveBeenCalledWith('selector.proof', 'new-password-123', 'new-password-123');
    expect(fixture.nativeElement.textContent).toContain('This password reset link is invalid');
    expect(fixture.nativeElement.querySelector('a[href="/admin/forgot-password"]')).not.toBeNull();
  });

  it('shows success and removes the token-bearing URL with replaceUrl navigation', async () => {
    const component = await setup('customer', 'reset', 'selector.proof');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.resetForm.setValue({ password: 'new-password-123', confirmPassword: 'new-password-123' });
    await component.submitReset();
    fixture.detectChanges();

    expect(component.success()).toBe(true);
    expect(navigate).toHaveBeenCalledWith([], { relativeTo: route, queryParams: {}, replaceUrl: true });
    expect(fixture.nativeElement.textContent).toContain('Your password has been changed');
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).not.toBeNull();
  });
});
