import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, User } from '../models';
import { CustomerAccountScopeService } from './customer-account-scope.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private authenticationCheck: Promise<boolean> | null = null;
  private readonly accountScope = inject(CustomerAccountScopeService);
  private revision = 0;
  private pendingVerificationLogin?: { email: string; password: string; expiresAt: number };
  private pendingVerificationTimer?: ReturnType<typeof setTimeout>;
  get sessionVersion(): number { return this.revision; }

  readonly user = signal<User | null>(null);

  ensureAuthenticated(): Promise<boolean> {
    if (this.user()) return Promise.resolve(true);
    if (this.authenticationCheck) return this.authenticationCheck;

    this.authenticationCheck = this.loadCurrentUser().finally(() => {
      this.authenticationCheck = null;
    });
    return this.authenticationCheck;
  }

  async login(email: string, password: string): Promise<void> {
    const revision = ++this.revision;
    let response: ApiResponse<User>;
    try {
      response = await firstValueFrom(this.http.post<ApiResponse<User>>(
        `${environment.apiBaseUrl}/auth/login`, { email, password }, { withCredentials: true }));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.code === 'EMAIL_NOT_VERIFIED') {
        this.rememberVerificationLogin(email, password);
      }
      throw error;
    }
    this.forgetVerificationLogin();
    if (revision === this.revision) this.setUser(response.data);
  }

  async register(value: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/register`, value, {
        withCredentials: true,
      }),
    );
    // A new registration must not keep showing or using the previous customer's session.
    if (this.user()) {
      try { await this.logout(); } catch { this.clearSession(); }
    } else {
      this.clearSession();
    }
    this.rememberVerificationLogin(value.email, value.password);
  }

  async logout(): Promise<void> {
    const revision = ++this.revision;
    try {
      await firstValueFrom(
        this.http.post<void>(`${environment.apiBaseUrl}/auth/logout`, {}, { withCredentials: true }),
      );
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    } finally {
      if (revision === this.revision) this.clearSession();
    }
  }

  async verifyEmail(email: string, code: string): Promise<boolean> {
    await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/auth/email/verify`, { email, code }));
    const pending = this.pendingVerificationLogin;
    this.forgetVerificationLogin();
    if (pending && pending.email === email.trim().toLowerCase() && pending.expiresAt > Date.now()) {
      try {
        await this.login(email, pending.password);
        return this.user()?.email?.toLowerCase() === pending.email;
      } catch { this.clearSession(); }
    }
    return false;
  }
  async resendEmailCode(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/auth/email/resend`, { email }));
  }

  async updatePhone(phone: string): Promise<void> {
    const revision = this.revision;
    const response = await firstValueFrom(
      this.http.patch<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/me/phone`, { phone }, {
        withCredentials: true,
      }),
    );
    if (revision === this.revision) this.setUser(response.data);
  }

  async logoutAll(): Promise<void> {
    const revision = ++this.revision;
    try {
      await firstValueFrom(this.http.post<void>(`${environment.apiBaseUrl}/auth/logout-all`, {}, { withCredentials: true }));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    }
    if (revision === this.revision) this.clearSession();
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${environment.apiBaseUrl}/auth/password/forgot`,
        { email },
      ),
    );
  }

  async resetPassword(token: string, password: string, confirmPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${environment.apiBaseUrl}/auth/password/reset`,
        { token, password, confirmPassword },
      ),
    );
  }

  private async loadCurrentUser(): Promise<boolean> {
    const revision = this.revision;
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/me`, {
          withCredentials: true,
        }),
      );
      if (revision !== this.revision) return this.user() !== null;
      this.setUser(response.data);
      return true;
    } catch {
      if (revision === this.revision) this.clearSession();
      return this.user() !== null;
    }
  }

  private setUser(user: User): void {
    this.revision += 1;
    this.accountScope.setPrincipal(String(user.id));
    this.user.set({ ...user, id: String(user.id) });
  }

  clearSession(): void {
    this.forgetVerificationLogin();
    this.revision += 1;
    this.accountScope.setPrincipal(null);
    this.user.set(null);
  }

  private rememberVerificationLogin(email: string, password: string): void {
    this.forgetVerificationLogin();
    this.pendingVerificationLogin = { email: email.trim().toLowerCase(), password, expiresAt: Date.now() + 10 * 60_000 };
    this.pendingVerificationTimer = setTimeout(() => this.forgetVerificationLogin(), 10 * 60_000);
  }

  private forgetVerificationLogin(): void {
    clearTimeout(this.pendingVerificationTimer);
    this.pendingVerificationTimer = undefined;
    this.pendingVerificationLogin = undefined;
  }
}
