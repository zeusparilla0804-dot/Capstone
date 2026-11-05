import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminCustomerDetailPage } from './admin-customer-detail.page';

describe('AdminCustomerDetailPage', () => {
  let fixture: ComponentFixture<AdminCustomerDetailPage>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(async () => {
    api = {
      customer: vi.fn(() => of({ success: true, data: { id: 7, firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567', address: 'Santa Rosa', status: 'ACTIVE', createdAt: '2026-01-01' } })),
      customerBookings: vi.fn(() => of({ success: true, data: { items: [{ id: 42, reference: 'LC-0042', eventType: 'Wedding', eventDate: '2026-12-10', guestCount: 100, total: 85000, amountPaid: 10000, outstandingBalance: 75000, invoiceId: 8, invoiceNumber: 'INV-8', invoiceStatus: 'ISSUED', status: 'AWAITING_PAYMENT' }], page: 1, pageSize: 10, totalItems: 11, totalPages: 2 } })),
      customerPayments: vi.fn(() => of({ success: true, data: { items: [{ id: '9007199254740993', bookingId: 42, bookingReference: 'LC-0042', amount: 10000, paymentMethod: 'CASH', paymentDate: '2026-10-01' }], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } })),
      updateCustomer: vi.fn(() => of({ success: true, data: { id: 7, firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567', address: 'Santa Rosa', status: 'ACTIVE', createdAt: '2026-01-01' } })),
      updateCustomerStatus: vi.fn(() => of({ success: true, data: { id: 7, firstName: 'Klint', lastName: 'Charles', email: 'klint@example.test', phone: '09171234567', address: 'Santa Rosa', status: 'INACTIVE', createdAt: '2026-01-01' } })),
    };
    await TestBed.configureTestingModule({ imports: [AdminCustomerDetailPage], providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } }, { provide: AdminService, useValue: api }, { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }] }).compileComponents();
    fixture = TestBed.createComponent(AdminCustomerDetailPage);
    fixture.detectChanges();
  });

  it('renders profile, direct booking/invoice links, and exact payment history', () => {
    expect(fixture.nativeElement.textContent).toContain('Klint Charles');
    expect(fixture.nativeElement.textContent).toContain('9007199254740993');
    expect(fixture.nativeElement.querySelector('a[href="/admin/bookings/42"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/admin/invoices/8"]')).not.toBeNull();
  });

  it('paginates customer bookings directly by customer id', () => {
    const component = fixture.componentInstance as unknown as { loadBookings(page: number): void };
    component.loadBookings(2);
    expect(api['customerBookings']).toHaveBeenLastCalledWith(7, 2, 10);
  });

  it('populates editable profile fields and never renders a password control', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect((element.querySelector('[formcontrolname="firstName"]') as HTMLInputElement).value).toBe('Klint');
    expect((element.querySelector('[formcontrolname="email"]') as HTMLInputElement).value).toBe('klint@example.test');
    expect(element.querySelector('input[type="password"]')).toBeNull();
  });

  it('submits only the validated editable customer fields', () => {
    const component = fixture.componentInstance as any;
    component.profileForm.setValue({ firstName: '  Maria ', lastName: ' Santos ', email: 'MARIA@EXAMPLE.TEST ', phone: ' 09170000000 ' });
    component.saveProfile();
    expect(api['updateCustomer']).toHaveBeenCalledWith(7, {
      firstName: 'Maria', lastName: 'Santos', email: 'maria@example.test', phone: '09170000000',
    });
  });

  it('shows an actionable duplicate-email response without replacing history', () => {
    api['updateCustomer'] = vi.fn(() => throwError(() => ({ status: 409, error: { message: 'Email is already in use.' } })));
    const component = fixture.componentInstance as any;
    component.api = api;
    component.saveProfile();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Email is already in use.');
    expect(fixture.nativeElement.textContent).toContain('Booking history');
  });

  it('cancels a status confirmation without calling the API', () => {
    const component = fixture.componentInstance as any;
    component.requestStatusChange();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    component.cancelStatusChange();
    fixture.detectChanges();
    expect(api['updateCustomerStatus']).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('disables the status decision while saving and refreshes the inactive state', () => {
    const pending = new Subject<any>();
    api['updateCustomerStatus'] = vi.fn(() => pending);
    const component = fixture.componentInstance as any;
    component.api = api;
    component.requestStatusChange();
    component.confirmStatusChange();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.status-confirm') as HTMLButtonElement).disabled).toBe(true);
    pending.next({ success: true, data: { ...component.profile(), status: 'INACTIVE' } });
    pending.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Inactive');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});

