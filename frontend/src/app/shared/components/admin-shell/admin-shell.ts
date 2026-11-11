import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { PortalBadgeStateService } from '../../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../dashboard-sidebar/dashboard-sidebar';

@Component({
  selector: 'app-admin-shell',
  imports: [DashboardSidebarComponent],
  templateUrl: './admin-shell.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './admin-shell.scss',
})
export class AdminShellComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  protected readonly auth = inject(AdminAuthService);
  protected readonly badgeState = inject(PortalBadgeStateService);
  private readonly router = inject(Router);
  protected readonly signingOutAll = signal(false);
  protected readonly sessionError = signal('');
  protected readonly renewingSession = signal(false);
  protected async staySignedIn(): Promise<void> {
    if (this.renewingSession()) return;
    this.renewingSession.set(true);
    this.sessionError.set('');
    try { await this.auth.keepAlive(); }
    catch { this.sessionError.set('Unable to renew your session. Please save your work and sign in again.'); }
    finally { this.renewingSession.set(false); }
  }
  protected readonly nav = computed<readonly DashboardNavItem[]>(() => [
    { label: 'Overview', route: '/admin/dashboard', icon: 'dashboard' },
    { label: 'Reservations', route: '/admin/bookings', icon: 'calendar', badge: this.badgeState.adminBadges().bookings, badgeLabel: 'pending reservation reviews' },
    { label: 'Customers', route: '/admin/customers', icon: 'profile' },
    { label: 'Billing & Payments', route: '/admin/payments', icon: 'wallet', badge: this.badgeState.adminBadges().payments, badgeLabel: 'payments awaiting review' },
    { label: 'Payment QR Codes', route: '/admin/payment-qrs', icon: 'wallet' },
    { label: 'Reports', route: '/admin/reports', icon: 'reports' },
    { label: 'Packages & Menu', route: '/admin/packages', icon: 'catalog' },
    {
      label: 'Sign out all devices',
      busyLabel: 'Signing out...',
      route: '/admin/login',
      icon: 'logout',
      isAction: true,
      disabled: this.signingOutAll(),
      busy: this.signingOutAll(),
      confirmationMessage: 'Sign out this administrator account on every device?',
      confirmationAllDevices: true,
    },
    {
      label: 'Logout',
      route: '/admin/login',
      icon: 'logout',
      isAction: true,
      confirmationMessage: 'Are you sure you want to log out of the administrator dashboard?',
    },
  ]);

  protected async action(item: DashboardNavItem): Promise<void> {
    if (!item.isAction) return;
    if (item.label !== 'Sign out all devices') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
      return;
    }
    if (this.signingOutAll()) return;

    this.signingOutAll.set(true);
    this.sessionError.set('');
    try {
      await this.auth.logoutAll();
      await this.router.navigate(['/admin/login']);
    } catch {
      this.sessionError.set('Unable to sign out all devices. Please try again.');
    } finally {
      this.signingOutAll.set(false);
    }
  }
}
