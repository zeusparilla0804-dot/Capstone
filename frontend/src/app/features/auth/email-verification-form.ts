import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({ selector: 'app-email-verification-form', imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './email-verification-form.html', styleUrl: './email-verification-form.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class EmailVerificationForm {
  private readonly auth = inject(AuthService);
  readonly email = input('');
  readonly verified = output<void>();
  protected readonly busy = signal(false);
  protected readonly resendIn = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(255)] }),
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] }),
  });
  private timer?: ReturnType<typeof setInterval>;
  private completed = false;
  constructor() {
    effect(() => { if (this.email()) this.form.controls.email.setValue(this.email()); });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }
  protected async submit(): Promise<void> {
    if (this.busy() || this.completed) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      const values = this.form.getRawValue();
      await this.auth.verifyEmail(values.email.trim(), values.code);
      this.completed = true; this.form.controls.code.reset(''); this.verified.emit();
    } catch (error) { this.error.set(this.message(error, 'Unable to verify this code. Check your email or request a new code.')); }
    finally { this.busy.set(false); }
  }
  protected async resend(): Promise<void> {
    if (this.busy() || this.completed || this.resendIn() > 0) return;
    if (this.form.controls.email.invalid) { this.form.controls.email.markAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    try {
      await this.auth.resendEmailCode(this.form.controls.email.value.trim());
      this.form.controls.code.reset(''); this.resendIn.set(60);
      this.notice.set('If your account needs verification, a code will arrive shortly. Check your Inbox and Spam folder.');
      clearInterval(this.timer);
      this.timer = setInterval(() => { this.resendIn.update(value => Math.max(0, value - 1)); if (this.resendIn() === 0) clearInterval(this.timer); }, 1000);
    } catch (error) { this.error.set(this.message(error, 'Unable to request a new code. Please try again shortly.')); }
    finally { this.busy.set(false); }
  }
  private message(error: unknown, fallback: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : fallback;
  }
}
