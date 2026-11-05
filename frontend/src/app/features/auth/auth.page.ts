import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { AsteriskPasswordDirective } from '../../shared/directives/asterisk-password.directive';
import { RegistrationSuccessDialog } from './registration-success-dialog';
import { PHILIPPINE_MOBILE_PATTERN } from '../../shared/utils/phone-number';
import { EmailVerificationForm } from './email-verification-form';
@Component({
  selector: 'app-auth-page',
  imports: [PublicHeaderComponent, ReactiveFormsModule, RouterLink, AsteriskPasswordDirective, RegistrationSuccessDialog, EmailVerificationForm],
  templateUrl: './auth.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './auth.page.scss',
})
export class AuthPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private continuingToSignIn = false;
  protected readonly registerMode = signal(false);
  protected readonly verificationMode = signal(this.route.snapshot.data?.['verifyEmail'] === true);
  protected readonly verificationEmail = signal(this.route.snapshot.queryParamMap.get('email') ?? '');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly registrationSucceeded = signal(false);
  protected readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(100),
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(100),
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    phone: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(30),
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)],
    }),
  });
  protected toggle() {
    if (this.submitting()) return;
    this.registerMode.update((v) => !v);
    this.form.controls.email.reset('');
    this.form.controls.password.reset('');
    this.showPassword.set(false);
    this.updateModeValidators();
    this.error.set('');
  }

  private updateModeValidators(): void {
    const registrationMode = this.registerMode();
    this.form.controls.firstName.setValidators(
      registrationMode ? [Validators.required, Validators.maxLength(100)] : Validators.maxLength(100),
    );
    this.form.controls.lastName.setValidators(
      registrationMode ? [Validators.required, Validators.maxLength(100)] : Validators.maxLength(100),
    );
    this.form.controls.phone.setValidators(
      registrationMode
        ? [Validators.required, Validators.pattern(PHILIPPINE_MOBILE_PATTERN), Validators.maxLength(30)]
        : Validators.maxLength(30),
    );
    this.form.controls.password.setValidators(
      registrationMode
        ? [Validators.required, Validators.minLength(15), Validators.maxLength(128)]
        : [Validators.required, Validators.maxLength(128)],
    );
    for (const control of Object.values(this.form.controls)) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
  protected async submit() {
    if (this.submitting() || this.registrationSucceeded() || this.verificationMode()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please review the highlighted fields.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      if (this.registerMode()) {
        await this.auth.register(v);
        this.form.reset();
        await this.showEmailVerification(v.email);
      } else {
        await this.auth.login(v.email, v.password);
        await this.router.navigateByUrl('/dashboard');
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.code === 'EMAIL_NOT_VERIFIED') {
        await this.showEmailVerification(this.form.controls.email.value);
        return;
      }
      const message =
        error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
          ? error.error.message
          : '';
      this.error.set(
        message ||
          (this.registerMode() ? 'Unable to create your account.' : 'Invalid email or password.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async showEmailVerification(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    this.verificationEmail.set(normalized); this.verificationMode.set(true); this.registerMode.set(false);
    this.form.controls.password.reset(''); this.showPassword.set(false); this.updateModeValidators();
    await this.router.navigateByUrl(`/verify-email?email=${encodeURIComponent(normalized)}`);
  }
  protected emailVerified(): void { this.registrationSucceeded.set(true); }

  protected async continueToSignIn(): Promise<void> {
    if (!this.registrationSucceeded() || this.continuingToSignIn) return;
    this.continuingToSignIn = true;
    try {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      this.registerMode.set(false); this.verificationMode.set(false); this.verificationEmail.set('');
      this.showPassword.set(false); this.updateModeValidators();
      this.form.reset();
      this.registrationSucceeded.set(false);
      if (!this.destroyRef.destroyed) afterNextRender(() => this.element.nativeElement.querySelector<HTMLInputElement>('#email')?.focus(), { injector: this.injector });
    } finally {
      this.continuingToSignIn = false;
    }
  }
}
