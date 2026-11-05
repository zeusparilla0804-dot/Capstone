import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePageComponent),
    title: 'LA Chef | Catering Services',
  },
  {
    path: 'packages',
    loadComponent: () =>
      import('./features/packages/packages.page').then((m) => m.PackagesPageComponent),
    title: 'Packages | LA Chef',
  },
  {
    path: 'book-event',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/booking/booking.page').then((m) => m.BookingPageComponent),
    title: 'Book an Event | LA Chef',
  },
  {
    path: 'custom-event',
    redirectTo: 'packages',
    pathMatch: 'full',
  },
  {
    path: 'events',
    loadComponent: () => import('./features/events/events.page').then((m) => m.EventsPageComponent),
    title: 'Events | LA Chef',
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/checkout/checkout.page').then((m) => m.CheckoutPageComponent),
    title: 'Checkout | LA Chef',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPageComponent),
    title: 'Sign In | LA Chef',
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./features/auth/auth.page').then(m => m.AuthPageComponent),
    data: Object.freeze({ verifyEmail: true }),
    title: 'Verify Email | LA Chef',
  },
  {
    path: 'forgot-password',
    data: Object.freeze({ audience: 'customer', mode: 'forgot' }),
    loadComponent: () => import('./features/password-recovery/password-recovery.page').then(m => m.PasswordRecoveryPage),
    title: 'Reset Password | LA Chef',
  },
  {
    path: 'reset-password',
    data: Object.freeze({ audience: 'customer', mode: 'reset' }),
    loadComponent: () => import('./features/password-recovery/password-recovery.page').then(m => m.PasswordRecoveryPage),
    title: 'Choose a New Password | LA Chef',
  },
  {
    path: 'my-bookings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/my-bookings/my-bookings.page').then((m) => m.MyBookingsPageComponent),
    title: 'My Reservations | LA Chef',
  },
  {
    path: 'my-bookings/:id/payment',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payment-proof/payment-proof.page').then((m) => m.PaymentProofPageComponent),
    title: 'Payment Proof | LA Chef',
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customer-dashboard/customer-dashboard.page').then(
        (m) => m.CustomerDashboardPageComponent,
      ),
    title: 'Dashboard | LA Chef',
  },
  {
    path: 'billing',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customer-billing/customer-billing.page').then(
        (m) => m.CustomerBillingPageComponent,
      ),
    title: 'Billing & Payments | LA Chef',
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customer-profile/customer-profile.page').then(
        (m) => m.CustomerProfilePageComponent,
      ),
    title: 'Profile | LA Chef',
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin-login/admin-login.page').then((m) => m.AdminLoginPage),
    title: 'Admin Sign In | LA Chef',
  },
  {
    path: 'admin/forgot-password',
    data: Object.freeze({ audience: 'admin', mode: 'forgot' }),
    loadComponent: () => import('./features/password-recovery/password-recovery.page').then(m => m.PasswordRecoveryPage),
    title: 'Admin Password Recovery | LA Chef',
  },
  {
    path: 'admin/reset-password',
    data: Object.freeze({ audience: 'admin', mode: 'reset' }),
    loadComponent: () => import('./features/password-recovery/password-recovery.page').then(m => m.PasswordRecoveryPage),
    title: 'Choose an Admin Password | LA Chef',
  },
  {
    path: 'admin/dashboard',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-dashboard/admin-dashboard.page').then(
        (m) => m.AdminDashboardPageComponent,
      ),
    title: 'Admin Dashboard | LA Chef',
  },
  {
    path: 'admin/bookings',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-bookings/admin-bookings.page').then((m) => m.AdminBookingsPage),
    title: 'Reservations | LA Chef Admin',
  },
  {
    path: 'admin/bookings/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-booking-detail/admin-booking-detail.page').then(
        (m) => m.AdminBookingDetailPage,
      ),
    title: 'Reservation Detail | LA Chef Admin',
  },
  {
    path: 'admin/customers',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-customers/admin-customers.page').then((m) => m.AdminCustomersPage),
    title: 'Customers | LA Chef Admin',
  },
  {
    path: 'admin/customers/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin-customer-detail/admin-customer-detail.page').then((m) => m.AdminCustomerDetailPage),
    title: 'Customer Record | LA Chef Admin',
  },
  {
    path: 'admin/packages',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-packages/admin-packages.page').then((m) => m.AdminPackagesPage),
    title: 'Packages & Menu | LA Chef Admin',
  },
  {
    path: 'admin/add-ons',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-addons/admin-addons.page').then((m) => m.AdminAddOnsPage),
    title: 'Packages & Menu | LA Chef Admin',
  },
  {
    path: 'admin/payments',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-payments/admin-payments.page').then((m) => m.AdminPaymentsPage),
    title: 'Payments | LA Chef Admin',
  },
  {
    path: 'admin/reports',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-reports/admin-reports.page').then((m) => m.AdminReportsPage),
    title: 'Reports | LA Chef Admin',
  },
  {
    path: 'admin/payments/proofs/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin-payment-review/admin-payment-review.page').then(
        (m) => m.AdminPaymentReviewPage,
      ),
    title: 'Payment Proof Review | LA Chef Admin',
  },
  {
    path: 'admin/email-outbox',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin-email-outbox/admin-email-outbox.page').then((m) => m.AdminEmailOutboxPage),
    title: 'Email Operations | LA Chef Admin',
  },
  {
    path: 'admin/audit-log',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin-audit-log/admin-audit-log.page').then((m) => m.AdminAuditLogPage),
    title: 'Audit Log | LA Chef Admin',
  },
  {
    path: 'admin/invoices/:id',
    canActivate: [adminGuard],
    data: { admin: true },
    loadComponent: () =>
      import('./features/invoice/invoice.page').then((m) => m.InvoicePageComponent),
    title: 'Invoice | LA Chef Admin',
  },
  {
    path: 'invoice/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoice/invoice.page').then((m) => m.InvoicePageComponent),
    title: 'Invoice | LA Chef',
  },
  {
    path: 'about',
    data: { page: 'about' },
    loadComponent: () =>
      import('./features/home/simple-info.page').then((m) => m.SimpleInfoPageComponent),
    title: 'About | LA Chef',
  },
  {
    path: 'contact',
    data: { page: 'contact' },
    loadComponent: () =>
      import('./features/home/simple-info.page').then((m) => m.SimpleInfoPageComponent),
    title: 'Contact | LA Chef',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.page').then((m) => m.NotFoundPageComponent),
    title: 'Page Not Found | LA Chef',
  },
];
