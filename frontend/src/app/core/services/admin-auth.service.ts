import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<User | null>(null);
  private checked = false;

  async ensure(): Promise<boolean> {
    if (this.user()) return true;
    if (this.checked) return false;
    this.checked = true;
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/admin/me`, { withCredentials: true }),
      );
      this.user.set({ ...response.data, id: String(response.data.id) });
      return true;
    } catch {
      return false;
    }
  }

  async login(identity: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<User>>(
        `${environment.apiBaseUrl}/auth/admin/login`,
        { identity, password },
        { withCredentials: true },
      ),
    );
    this.user.set({ ...response.data, id: String(response.data.id) });
    this.checked = true;
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${environment.apiBaseUrl}/auth/admin/logout`, {}, { withCredentials: true }),
    );
    this.user.set(null);
    this.checked = true;
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
