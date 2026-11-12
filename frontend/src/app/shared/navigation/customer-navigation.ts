import type { DashboardNavItem } from '../components/dashboard-sidebar/dashboard-sidebar';

export function customerNavItems(bookingCount = 0, billingCount = 0): readonly DashboardNavItem[] {
  return [
  { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
  { label: 'My Reservations', route: '/my-bookings', icon: 'calendar', badge: bookingCount, badgeLabel: 'current reservations' },
  { label: 'Billing & Payments', route: '/billing', icon: 'wallet', badge: billingCount, badgeLabel: 'reservations with outstanding payments' },
  { label: 'Profile', route: '/profile', icon: 'profile' },
  {
    label: 'Logout',
    route: '/',
    icon: 'logout',
    isAction: true,
    confirmationMessage: 'Are you sure you want to log out?',
  },
  ];
}

export const CUSTOMER_NAV_ITEMS: readonly DashboardNavItem[] = customerNavItems();
