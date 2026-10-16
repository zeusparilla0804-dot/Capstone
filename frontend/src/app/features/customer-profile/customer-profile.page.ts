import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { customerNavItems } from '../../shared/navigation/customer-navigation';
import { initialsForName } from '../../shared/utils/user-display';

@Component({
  selector: 'app-customer-profile-page',
  imports: [DashboardSidebarComponent, RouterLink],
  templateUrl: './customer-profile.page.html',
  styleUrl: './customer-profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProfilePageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly badgeState = inject(PortalBadgeStateService);
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount()));
  protected readonly initials = computed(() => initialsForName(this.auth.user()?.fullName));

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }

}
