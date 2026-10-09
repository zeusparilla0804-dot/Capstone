import type { DashboardNavItem } from '../components/dashboard-sidebar/dashboard-sidebar';

export const CUSTOMER_NAV_ITEMS: readonly DashboardNavItem[] = [
  { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
  { label: 'My Bookings', route: '/my-bookings', icon: 'calendar' },
  { label: 'Billing & Payments', route: '/billing', icon: 'wallet' },
  { label: 'Profile', route: '/profile', icon: 'profile' },
  { label: 'Logout', route: '/', icon: 'logout', isAction: true },
];
