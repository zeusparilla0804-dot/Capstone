import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-login.page.html',
  styleUrl: './admin-login.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminLoginPage {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly form = new FormGroup({
    identity: new FormControl('', { nonNullable: true, validators: Validators.required }),
    password: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });
  protected async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.form.value.identity!, this.form.value.password!);
      await this.router.navigateByUrl(
        this.route.snapshot.queryParamMap.get('returnUrl') ?? '/admin/dashboard',
      );
    } catch {
      this.error.set('Invalid administrator credentials.');
    } finally {
      this.busy.set(false);
    }
  }
}
