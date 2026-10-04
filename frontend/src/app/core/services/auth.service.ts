import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private authenticationCheck: Promise<boolean> | null = null;

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
    const response = await firstValueFrom(
      this.http.post<ApiResponse<User>>(
        `${environment.apiBaseUrl}/auth/login`,
        { email, password },
        { withCredentials: true },
      ),
    );
    this.setUser(response.data);
  }

  async register(value: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/register`, value, {
        withCredentials: true,
      }),
    );
    this.setUser(response.data);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<void>(`${environment.apiBaseUrl}/auth/logout`, {}, { withCredentials: true }),
      );
    } finally {
      this.user.set(null);
    }
  }

  private async loadCurrentUser(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<User>>(`${environment.apiBaseUrl}/auth/me`, {
          withCredentials: true,
        }),
      );
      this.setUser(response.data);
      return true;
    } catch {
      this.user.set(null);
      return false;
    }
  }

  private setUser(user: User): void {
    this.user.set({ ...user, id: String(user.id) });
  }
}
