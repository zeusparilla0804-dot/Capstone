import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminAuthService, type AdminMfaChallenge } from '../../core/services/admin-auth.service';
import { AsteriskPasswordDirective } from '../../shared/directives/asterisk-password.directive';
@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, RouterLink, AsteriskPasswordDirective],
  templateUrl: './admin-login.page.html',
  styleUrl: './admin-login.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminLoginPage {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly challenge = signal<AdminMfaChallenge | null>(null);
  protected readonly setupQrCode = signal('');
  protected readonly recoveryCodes = signal<string[]>([]);
  protected readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(?:\d{6}|[0-9A-Fa-f]{20})$/)] });
  protected readonly mfaForm = new FormGroup({ code: this.code });
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
    this.setupQrCode.set('');
    try {
      const result = await this.auth.login(this.form.value.identity!, this.form.value.password!);
      if (result?.requiresMfa) {
        this.challenge.set(result);
        this.form.controls.password.setValue('');
        if (result.setupSecret && result.setupUri) {
          try {
            const { default: qrCode } = await import('qrcode');
            const svg = await qrCode.toString(result.setupUri, { type: 'svg', width: 216, margin: 4, errorCorrectionLevel: 'M' });
            if (this.challenge() === result) {
              this.setupQrCode.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
            }
          } catch {
            // Manual setup remains available if local QR rendering is unavailable.
          }
        }
        return;
      }
      await this.router.navigateByUrl('/admin/dashboard');
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 0
        ? 'Cannot connect to the server. Please try again shortly.'
        : 'Invalid administrator credentials.');
    } finally {
      this.busy.set(false);
    }
  }
  protected async verifyCode(): Promise<void> {
    const pending = this.challenge();
    if (!pending || this.code.invalid) { this.code.markAsTouched(); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      const codes = await this.auth.completeMfa(pending.challenge, this.code.value.trim());
      this.challenge.set(null);
      this.setupQrCode.set('');
      if (codes?.length) this.recoveryCodes.set(codes);
      else await this.router.navigateByUrl('/admin/dashboard');
    } catch {
      this.error.set('Invalid or expired code. Sign in again if the challenge has expired.');
    } finally { this.busy.set(false); }
  }
  protected async finishSetup(): Promise<void> {
    this.recoveryCodes.set([]);
    await this.router.navigateByUrl('/admin/dashboard');
  }
  protected restart(): void {
    this.challenge.set(null);
    this.setupQrCode.set('');
    this.code.setValue('');
    this.error.set('');
  }
}
