import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
@Component({
  selector: 'app-auth-page',
  imports: [PublicHeaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './auth.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './auth.page.scss',
})
export class AuthPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly registerMode = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
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
    this.registerMode.update((v) => !v);
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
        ? [Validators.required, Validators.minLength(7), Validators.maxLength(30)]
        : Validators.maxLength(30),
    );
    this.form.controls.password.setValidators(
      registrationMode
        ? [Validators.required, Validators.minLength(12), Validators.maxLength(128)]
        : [Validators.required, Validators.maxLength(128)],
    );
    for (const control of Object.values(this.form.controls)) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please review the highlighted fields.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      if (this.registerMode()) await this.auth.register(v);
      else await this.auth.login(v.email, v.password);
      await this.router.navigateByUrl(
        this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard',
      );
    } catch (error) {
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
}
