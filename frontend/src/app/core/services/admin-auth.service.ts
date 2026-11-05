import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, User } from '../models';

export interface AdminMfaChallenge { requiresMfa: true; challenge: string; setupSecret?: string; setupUri?: string; }

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router, { optional: true });
  private idleTimer?: ReturnType<typeof setTimeout>;
  private warningTimer?: ReturnType<typeof setTimeout>;
  readonly idleWarning = signal(false);
  private idleMinutes = 30;
  constructor() { inject(DestroyRef).onDestroy(() => { clearTimeout(this.idleTimer); clearTimeout(this.warningTimer); }); }
  noteActivity(minutes?: number): void {
    if (minutes && Number.isInteger(minutes) && minutes > 0 && minutes <= 1440) this.idleMinutes = minutes;
    clearTimeout(this.idleTimer);
    clearTimeout(this.warningTimer);
    this.idleWarning.set(false);
    if (!this.user()) return;
    this.warningTimer = setTimeout(() => this.idleWarning.set(true), Math.max(0, this.idleMinutes * 60_000 - 60_000));
    this.idleTimer = setTimeout(() => {
      this.clearSession();
      if (this.router && /^\/admin(?:\/|$)/.test(this.router.url)) {
        void this.router.navigateByUrl('/admin/login', { replaceUrl: true });
      }
    }, this.idleMinutes * 60_000);
  }
  async keepAlive(): Promise<void> {
    const revision = this.revision;
    const response = await firstValueFrom(this.http.get<ApiResponse<User>>(
      `${environment.apiBaseUrl}/auth/admin/me`, { withCredentials: true }));
    if (revision !== this.revision) return;
    this.revision += 1;
    this.user.set({ ...response.data, id: String(response.data.id) });
    this.noteActivity();
  }
  readonly user = signal<User | null>(null);
  private authenticationCheck: Promise<boolean> | null = null;
  private revision = 0;
  get sessionVersion(): number { return this.revision; }

  async ensure(): Promise<boolean> {
    if (this.user()) return true;
    if (!this.authenticationCheck) {
      this.authenticationCheck = this.loadCurrentUser().finally(() => { this.authenticationCheck = null; });
    }
    return this.authenticationCheck;
  }

  private async loadCurrentUser(): Promise<boolean> {
    const revision = this.revision;
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/admin/me`, { withCredentials: true }),
      );
      if (revision !== this.revision) return this.user() !== null;
      this.revision += 1;
      this.user.set({ ...response.data, id: String(response.data.id) });
      this.noteActivity();
      return true;
    } catch {
      return this.user() !== null;
    }
  }

  async login(identity: string, password: string): Promise<AdminMfaChallenge | void> {
    const revision = ++this.revision;
    const response = await firstValueFrom(
      this.http.post<ApiResponse<User | AdminMfaChallenge>>(
        `${environment.apiBaseUrl}/auth/admin/login`,
        { identity, password },
        { withCredentials: true },
      ),
    );
    if (revision !== this.revision) return;
    if ('requiresMfa' in response.data) return response.data;
    this.revision += 1;
    this.user.set({ ...response.data, id: String(response.data.id) });
    this.noteActivity();
  }

  async completeMfa(challenge: string, code: string): Promise<string[] | undefined> {
    const revision = ++this.revision;
    const response = await firstValueFrom(this.http.post<ApiResponse<User & { recoveryCodes?: string[] }>>(
      `${environment.apiBaseUrl}/auth/admin/mfa/complete`, { challenge, code }, { withCredentials: true }));
    if (revision !== this.revision) return;
    this.revision += 1;
    const { recoveryCodes, ...user } = response.data;
    this.user.set({ ...user, id: String(user.id) });
    this.noteActivity();
    return recoveryCodes;
  }

  async logout(): Promise<void> {
    const revision = ++this.revision;
    try {
      await firstValueFrom(this.http.post<void>(`${environment.apiBaseUrl}/auth/admin/logout`, {}, { withCredentials: true }));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    }
    if (revision === this.revision) this.clearSession();
  }

  async logoutAll(): Promise<void> {
    const revision = ++this.revision;
    try {
      await firstValueFrom(this.http.post<void>(`${environment.apiBaseUrl}/auth/admin/logout-all`, {}, { withCredentials: true }));
    } catch (error) {
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    }
    if (revision === this.revision) this.clearSession();
  }

  clearSession(): void {
    clearTimeout(this.idleTimer);
    clearTimeout(this.warningTimer);
    this.idleWarning.set(false);
    this.revision += 1;
    this.user.set(null);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${environment.apiBaseUrl}/auth/admin/password/forgot`,
        { email },
      ),
    );
  }

  async resetPassword(token: string, password: string, confirmPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post<{ success: boolean; message: string }>(
        `${environment.apiBaseUrl}/auth/admin/password/reset`,
        { token, password, confirmPassword },
      ),
    );
  }
}
