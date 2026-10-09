import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { CUSTOMER_NAV_ITEMS } from '../../shared/navigation/customer-navigation';
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
  protected readonly navItems = CUSTOMER_NAV_ITEMS;
  protected readonly initials = computed(() => initialsForName(this.auth.user()?.fullName));

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }
}
