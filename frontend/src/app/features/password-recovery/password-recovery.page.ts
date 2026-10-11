import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AuthService } from '../../core/services/auth.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

type RecoveryAudience = 'customer' | 'admin';
type RecoveryMode = 'forgot' | 'reset';

@Component({
  selector: 'app-password-recovery',
  imports: [PublicHeaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './password-recovery.page.html',
  styleUrl: './password-recovery.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PasswordRecoveryPage {
  private readonly customerAuth = inject(AuthService);
  private readonly adminAuth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly audience = this.route.snapshot.data['audience'] as RecoveryAudience;
  protected readonly mode = this.route.snapshot.data['mode'] as RecoveryMode;
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly success = signal(false);
  protected readonly error = signal('');
  protected readonly invalidLink = signal(
    this.mode === 'reset' && !this.route.snapshot.queryParamMap.get('token'),
  );
  protected readonly showPassword = signal(false);
  protected readonly showConfirmation = signal(false);

  protected readonly forgotForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
  });
  protected readonly resetForm = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12), Validators.maxLength(128)],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12), Validators.maxLength(128)],
    }),
  });

  protected get isAdmin(): boolean { return this.audience === 'admin'; }
  protected get loginPath(): string { return this.isAdmin ? '/admin/login' : '/login'; }
  protected get forgotPath(): string { return this.isAdmin ? '/admin/forgot-password' : '/forgot-password'; }

  protected passwordsMismatch(): boolean {
    const { password, confirmPassword } = this.resetForm.getRawValue();
    return Boolean(confirmPassword) && password !== confirmPassword;
  }

  protected async submitForgot(): Promise<void> {
    if (this.busy()) return;
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const email = this.forgotForm.controls.email.value;
      if (this.isAdmin) await this.adminAuth.requestPasswordReset(email);
      else await this.customerAuth.requestPasswordReset(email);
      this.sent.set(true);
    } catch {
      this.error.set('We could not process your request right now. Please try again shortly.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async submitReset(): Promise<void> {
    if (this.busy()) return;
    if (this.resetForm.invalid || this.passwordsMismatch()) {
      this.resetForm.markAllAsTouched();
      return;
    }
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.invalidLink.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const { password, confirmPassword } = this.resetForm.getRawValue();
    try {
      if (this.isAdmin) await this.adminAuth.resetPassword(token, password, confirmPassword);
      else await this.customerAuth.resetPassword(token, password, confirmPassword);
      this.success.set(true);
      await this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    } catch (failure) {
      if (failure instanceof HttpErrorResponse && failure.error?.code === 'PASSWORD_RESET_INVALID') {
        this.invalidLink.set(true);
      } else {
        this.error.set('We could not change your password. Please try again.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
