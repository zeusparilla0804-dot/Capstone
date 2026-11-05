import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { AdminDashboard } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { AdminDashboardPageComponent } from './admin-dashboard.page';

const dashboard: AdminDashboard = {
  period: '2026-10',
  priority: { pendingBookingReviews: 4, proofsAwaitingVerification: 3, confirmedEventsNextSevenDays: 2, outstandingBalanceTotal: 125000, failedEmailNotifications: 1 },
  ledger: { confirmedRevenue: 285000, submittedProofValue: 45000, overdueOutstanding: 12000, averageConfirmedBookingValue: 95000 },
  actionQueues: [
    { key: 'pendingBookings', count: 4, href: '/admin/bookings?status=PENDING' },
    { key: 'submittedProofs', count: 3, href: '/admin/payments?status=SUBMITTED' },
    { key: 'failedEmails', count: 1, href: '/admin/email-outbox?status=FAILED' }
  ],
  attention: [{ type: 'PAYMENT_PROOF', id: '91', title: 'Review proof for LC-0042', detail: 'Klint Charles', eventDate: '2026-12-10', urgencyRank: 1 }]
};

describe('AdminDashboardPageComponent', () => {
  let fixture: ComponentFixture<AdminDashboardPageComponent>;
  let api: { dashboard: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { dashboard: vi.fn(() => of({ success: true, data: dashboard })) };
    await TestBed.configureTestingModule({ imports: [AdminDashboardPageComponent], providers: [provideRouter([]), { provide: AdminService, useValue: api }, { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }] }).compileComponents();
    fixture = TestBed.createComponent(AdminDashboardPageComponent);
    fixture.detectChanges();
  });

  it('renders priority queues with actionable links and failed-email work', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('4');
    expect(text).toContain('Booking reviews');
    expect(text).toContain('Failed notifications');
    expect(fixture.nativeElement.querySelector('a[href*="email-outbox"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href*="payments"]')).not.toBeNull();
  });

  it('publishes real priority counts to matching sidebar navigation badges', () => {
    expect(TestBed.inject(PortalBadgeStateService).adminBadges()).toEqual({
      bookings: 4,
      payments: 3,
      emails: 1,
    });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('a[href="/admin/bookings"] .dashboard-sidebar__badge')?.textContent?.trim()).toBe('4');
    expect(root.querySelector('a[href="/admin/payments"] .dashboard-sidebar__badge')?.textContent?.trim()).toBe('3');
    expect(root.querySelector('a[href="/admin/email-outbox"]')).toBeNull();
  });

  it('renders the editorial revenue ledger with distinct verified and submitted values and no generic chart', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Confirmed revenue');
    expect(text).toContain('Submitted proof value');
    expect(text).toContain('₱285,000');
    expect(text).toContain('₱45,000');
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-chart]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeNull();
  });

  it('keeps the priority balance as one stable numeric value without decorative section numbers', () => {
    const balance = fixture.nativeElement.querySelector('.balance-priority__value') as HTMLElement | null;
    expect(balance).not.toBeNull();
    expect(balance?.textContent?.replace(/\s/g, '')).toContain('125,000');
    expect(fixture.nativeElement.querySelector('.section-number')).toBeNull();
  });

  it('keeps the reporting month label, input, and action in one control row', () => {
    const input = fixture.nativeElement.querySelector('#reporting-period') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label[for="reporting-period"]') as HTMLLabelElement;

    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Reporting month');
    expect(label?.nextElementSibling).toBe(input);
    expect(input.nextElementSibling?.tagName).toBe('BUTTON');
  });
});

