import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminPaymentReport, AdminReservationReport } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminReportsPage } from './admin-reports.page';

const reservationReport: AdminReservationReport = {
  filters: { dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', eventType: '' },
  summary: { reservationCount: 2, totalGuests: 180 },
  upcomingItems: [{
    reference: 'LC-1001', customer: 'Ana Reyes', eventDate: '2026-10-22', eventTime: '18:00',
    eventType: 'Wedding', guestCount: 120, venue: 'Sta. Rosa', packageName: 'Diamond', status: 'APPROVED',
  }],
  items: [{
    reference: 'LC-1001', customer: 'Ana Reyes', eventDate: '2026-10-22', eventTime: '18:00',
    eventType: 'Wedding', guestCount: 120, venue: 'Sta. Rosa', packageName: 'Diamond', status: 'APPROVED',
  }],
};

const paymentReport: AdminPaymentReport = {
  filters: { dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', method: '' },
  summary: { totalBilled: 198888, verifiedPayments: 60000, outstandingBalance: 138888 },
  items: [{
    invoiceNumber: 'INV-1001', bookingReference: 'LC-1001', customer: 'Ana Reyes',
    issuedDate: '2026-10-03', latestPaymentDate: '2026-10-04', method: 'BANK_TRANSFER',
    amountDue: 198888, amountPaid: 60000, outstandingBalance: 138888, status: 'PARTIALLY_PAID',
  }],
};

describe('AdminReportsPage', () => {
  let fixture: ComponentFixture<AdminReportsPage>;
  let api: {
    reservationReport: ReturnType<typeof vi.fn>;
    paymentReport: ReturnType<typeof vi.fn>;
    exportReservationReport: ReturnType<typeof vi.fn>;
    exportPaymentReport: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T08:00:00+08:00'));
    api = {
      reservationReport: vi.fn(() => of({ success: true, data: reservationReport })),
      paymentReport: vi.fn(() => of({ success: true, data: paymentReport })),
      exportReservationReport: vi.fn(() => of(new Blob(['reservations']))),
      exportPaymentReport: vi.fn(() => of(new Blob(['payments']))),
    };
    TestBed.configureTestingModule({
      imports: [AdminReportsPage],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: {
          user: signal({ id: '1', fullName: 'LA Chef Admin', email: 'admin@lachef.com', role: 'admin' as const }),
          logout: vi.fn(), logoutAll: vi.fn(),
        } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(AdminReportsPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('loads both current-month reports and renders their summaries', () => {
    const root = render();
    expect(api.reservationReport).toHaveBeenCalledWith({
      dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', eventType: '',
    });
    expect(api.paymentReport).toHaveBeenCalledWith({
      dateFrom: '2026-10-01', dateTo: '2026-10-31', status: '', method: '',
    });
    expect(root.textContent).toContain('2');
    expect(root.textContent).toContain('180');

    root.querySelector<HTMLButtonElement>('#payments-tab')!.click();
    fixture.detectChanges();
    expect(root.textContent).toContain('198,888');
    expect(root.querySelector('#payments-panel')).not.toBeNull();
  });

  it('preserves independent filters while switching tabs and submits the active form', () => {
    const root = render();
    const eventType = root.querySelector<HTMLInputElement>('#reservation-event-type')!;
    eventType.value = 'Debut';
    eventType.dispatchEvent(new Event('input'));
    root.querySelector<HTMLFormElement>('#reservation-report-filters')!
      .dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(api.reservationReport).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: 'Debut' }));

    root.querySelector<HTMLButtonElement>('#payments-tab')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('#reservations-tab')!.click();
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('#reservation-event-type')!.value).toBe('Debut');
  });

  it('supports arrow-key navigation between report tabs', () => {
    const root = render();
    const reservations = root.querySelector<HTMLButtonElement>('#reservations-tab')!;
    const payments = root.querySelector<HTMLButtonElement>('#payments-tab')!;
    reservations.focus();
    reservations.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(payments.getAttribute('aria-selected')).toBe('true');
    expect(payments.tabIndex).toBe(0);
    expect(reservations.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(payments);
  });

  it('locks duplicate reservation requests while one is in progress', () => {
    const pending = new Subject<{ success: true; data: AdminReservationReport }>();
    api.reservationReport.mockReturnValue(pending);
    render();
    expect(api.reservationReport).toHaveBeenCalledTimes(1);

    (fixture.componentInstance as any).loadReservations();
    expect(api.reservationReport).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('#reservation-report-filters button[type="submit"]').disabled).toBe(true);

    pending.next({ success: true, data: reservationReport });
    pending.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#reservation-report-filters button[type="submit"]').disabled).toBe(false);
  });

  it('keeps errors and empty states independent and retries the failed report', () => {
    api.reservationReport.mockReturnValueOnce(throwError(() => ({ error: { message: 'The selected range is invalid.' } })));
    api.paymentReport.mockReturnValue(of({ success: true, data: { ...paymentReport, items: [] } }));
    const root = render();
    expect(root.querySelector('#reservations-panel [role="alert"]')?.textContent).toContain('selected range');

    api.reservationReport.mockReturnValue(of({ success: true, data: reservationReport }));
    root.querySelector<HTMLButtonElement>('#reservations-panel [data-action="retry"]')!.click();
    fixture.detectChanges();
    expect(api.reservationReport).toHaveBeenCalledTimes(2);

    root.querySelector<HTMLButtonElement>('#payments-tab')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#payments-panel')?.textContent).toContain('No payment records');
  });

  it('downloads the active report, names it, revokes the URL, and prints', () => {
    const root = render();
    const anchor = document.createElement('a');
    const anchorClick = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const createObjectUrl = vi.fn(() => 'blob:report');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    root.querySelector<HTMLButtonElement>('[data-action="export-report"]')!.click();
    expect(api.exportReservationReport).toHaveBeenCalledWith(reservationReport.filters);
    expect(anchor.download).toBe('la-chef-reservations-2026-10-16.csv');
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:report');

    root.querySelector<HTMLButtonElement>('[data-action="print-report"]')!.click();
    expect(print).toHaveBeenCalled();
  });
});
