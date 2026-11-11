import { stubNativeDialogs } from '../../testing/native-dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { PortalBadgeStateService } from '../../../core/services/portal-badge-state.service';
import { AdminShellComponent } from './admin-shell';

describe('AdminShellComponent session security', () => {
  let restoreNativeDialog: () => void;
  beforeEach(() => { restoreNativeDialog = stubNativeDialogs(); });
  afterEach(() => { TestBed.resetTestingModule(); restoreNativeDialog(); });
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('announces pending expiry and lets the administrator explicitly renew the session', async () => {
    const warning = signal(true);
    const auth = { user: signal({ fullName: 'Admin' }), idleWarning: warning,
      keepAlive: vi.fn(async () => { warning.set(false); }) };
    TestBed.configureTestingModule({ imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }] });
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.componentRef.setInput('title', 'Operations overview');
    fixture.componentRef.setInput('description', 'Review current operations.');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('less than a minute');
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Stay signed in'))!;
    button.click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(auth.keepAlive).toHaveBeenCalledOnce();
    expect(root.querySelector('.admin-session-warning')).toBeNull();
  });

  it('shows real operational counts beside their matching admin routes', () => {
    const auth = {
      user: signal({ id: '7', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
      idleWarning: signal(false),
      logout: async () => undefined,
      logoutAll: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }],
    });
    TestBed.inject(PortalBadgeStateService).setAdminDashboard({
      priority: {
        pendingBookingReviews: 4,
        proofsAwaitingVerification: 3,
        failedEmailNotifications: 2,
      },
    } as never);
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.componentRef.setInput('title', 'Operations overview');
    fixture.componentRef.setInput('description', 'Review current operations.');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const badgeFor = (href: string) => root
      .querySelector(`a[href="${href}"] .dashboard-sidebar__badge`)?.textContent?.trim();
    expect(badgeFor('/admin/bookings')).toBe('4');
    expect(badgeFor('/admin/payments')).toBe('3');
    expect(badgeFor('/admin/email-outbox')).toBeUndefined();
    expect(root.querySelector('a[href="/admin/custom-events"]')).toBeNull();
    const primaryLabels = Array.from(root.querySelectorAll<HTMLAnchorElement>('.dashboard-sidebar a .dashboard-sidebar__label'))
      .map(item => item.textContent?.trim());
    expect(primaryLabels).toEqual([
      'Overview', 'Reservations', 'Customers', 'Billing & Payments', 'Payment QR Codes', 'Reports', 'Packages & Menu'
    ]);
    expect(root.textContent).not.toContain('Email operations');
    expect(root.textContent).not.toContain('Audit log');
    expect(root.classList.contains('portal-surface')).toBe(false);
    expect(root.querySelector('.admin-layout')?.classList.contains('portal-surface')).toBe(true);
    const sidebar = root.querySelector('.dashboard-sidebar') as HTMLElement;
    expect(sidebar.classList).toContain('dashboard-sidebar--branded');
    expect(sidebar.classList).not.toContain('dashboard-sidebar--editorial');
    expect(sidebar.querySelector('.dashboard-sidebar__editorial-brand')?.textContent).toContain('Event Catering Services');
    expect(sidebar.querySelector('a.dashboard-sidebar__profile')).toBeNull();
    expect(getComputedStyle(root.querySelector('app-dashboard-sidebar') as HTMLElement).width).toBe('284px');
  });

  it('keeps the administrator signed in when logout confirmation is cancelled', async () => {
    const logout = vi.fn(async () => undefined);
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const auth = {
      idleWarning: signal(false),
      user: signal({ id: '7', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
      logout,
      logoutAll: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.componentRef.setInput('title', 'Operations overview');
    fixture.componentRef.setInput('description', 'Review current operations.');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === 'Logout')!;
    button.click();
    await fixture.whenStable();

    expect(document.querySelector('app-logout-dialog')?.textContent).toContain('Log out of La Chef?');
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="cancel"]')!.click();
    await fixture.whenStable();
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('locks the all-device action while revoking sessions and then opens admin login', async () => {
    let finish!: () => void;
    const auth = {
      user: signal({ id: '7', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
      idleWarning: signal(false),
      logout: async () => undefined,
      logoutAll: () => new Promise<void>(resolve => { finish = resolve; }),
    };
    TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.componentRef.setInput('title', 'Operations overview');
    fixture.componentRef.setInput('description', 'Review current operations.');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Sign out all devices'));
    expect(button).toBeTruthy();
    button!.click();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="confirm"]')!.click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(button!.disabled).toBe(true);
    expect(button!.textContent).toContain('Signing out');
    finish();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/admin/login']);
  });

  it('restores the administrator action and announces a retry after failure', async () => {
    const auth = {
      user: signal({ id: '7', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
      idleWarning: signal(false),
      logout: async () => undefined,
      logoutAll: async () => { throw new Error('offline'); },
    };
    TestBed.configureTestingModule({
      imports: [AdminShellComponent],
      providers: [provideRouter([]), { provide: AdminAuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(AdminShellComponent);
    fixture.componentRef.setInput('title', 'Operations overview');
    fixture.componentRef.setInput('description', 'Review current operations.');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.includes('Sign out all devices'))!;

    button.click();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="confirm"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Please try again');
    expect(auth.user()).not.toBeNull();
  });
});
