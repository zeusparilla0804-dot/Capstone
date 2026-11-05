import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationForm } from './email-verification-form';

describe('Customer email code form', () => {
  const auth = { verifyEmail: vi.fn(), resendEmailCode: vi.fn() };
  beforeEach(() => {
    auth.verifyEmail.mockReset().mockResolvedValue(undefined);
    auth.resendEmailCode.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ imports: [EmailVerificationForm], providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });
  it('submits the six-digit code and only announces success after backend verification', async () => {
    const fixture = TestBed.createComponent(EmailVerificationForm);
    fixture.componentRef.setInput('email', 'customer@example.test'); fixture.detectChanges();
    const component = fixture.componentInstance as any;
    const success = vi.fn(); fixture.componentInstance.verified.subscribe(success);
    component.form.controls.code.setValue('012345');
    let finish!: () => void;
    auth.verifyEmail.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = component.submit(); await component.submit();
    expect(auth.verifyEmail).toHaveBeenCalledOnce(); expect(success).not.toHaveBeenCalled();
    expect(auth.verifyEmail).toHaveBeenCalledWith('customer@example.test', '012345');
    finish(); await pending; expect(success).toHaveBeenCalledOnce();
  });
  it('rejects malformed codes and preserves backend errors without announcing success', async () => {
    const fixture = TestBed.createComponent(EmailVerificationForm);
    fixture.componentRef.setInput('email', 'customer@example.test'); fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.form.controls.code.setValue('12345'); await component.submit();
    expect(auth.verifyEmail).not.toHaveBeenCalled();
    component.form.controls.code.setValue('123456');
    auth.verifyEmail.mockRejectedValueOnce(new Error('failed')); await component.submit();
    expect(component.error()).toContain('Unable to verify');
    const code = fixture.nativeElement.querySelector('#verification-code');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('inputmode')).toBe('numeric');
  });
  it('prevents duplicate resends, clears old code and counts down before resending again', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(EmailVerificationForm);
      fixture.componentRef.setInput('email', 'customer@example.test'); fixture.detectChanges();
      const component = fixture.componentInstance as any;
      component.form.controls.code.setValue('123456');
      await component.resend(); await component.resend();
      expect(auth.resendEmailCode).toHaveBeenCalledOnce();
      expect(component.form.controls.code.value).toBe(''); expect(component.resendIn()).toBe(60);
      vi.advanceTimersByTime(60_000); expect(component.resendIn()).toBe(0);
      fixture.destroy();
    } finally { vi.useRealTimers(); }
  });
});
