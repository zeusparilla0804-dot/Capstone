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
  it('shows six digit slots, supports pasting a spaced code, and submits leading zeroes intact', async () => {
    const fixture = TestBed.createComponent(EmailVerificationForm);
    fixture.componentRef.setInput('email', 'customer@example.test'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.verification-digit').length).toBe(6);
    const code: HTMLInputElement = fixture.nativeElement.querySelector('#verification-code');
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '012 345' } });
    code.dispatchEvent(paste); fixture.detectChanges();
    expect(code.value).toBe('012345');
    expect([...fixture.nativeElement.querySelectorAll('.verification-digit')].map((slot: any) => slot.textContent.trim()).join('')).toBe('012345');
    await (fixture.componentInstance as any).submit();
    expect(auth.verifyEmail).toHaveBeenCalledWith('customer@example.test', '012345');
  });
  it('accepts autofill and removes non-digit characters without auto-submitting', () => {
    const fixture = TestBed.createComponent(EmailVerificationForm); fixture.detectChanges();
    const code: HTMLInputElement = fixture.nativeElement.querySelector('#verification-code');
    code.value = '01a2345'; code.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(code.value).toBe('012345');
    expect((fixture.componentInstance as any).form.controls.code.value).toBe('012345');
    expect(auth.verifyEmail).not.toHaveBeenCalled();
  });
});
