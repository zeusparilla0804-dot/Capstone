import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminAuditLogPage } from './admin-audit-log.page';

describe('AdminAuditLogPage', () => {
  let fixture: ComponentFixture<AdminAuditLogPage>;
  let api: { auditLog: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { auditLog: vi.fn(() => of({ success: true, data: { items: [{ id: '91', adminId: 2, adminUsername: 'admin', action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: 42, oldValues: { status: 'PENDING' }, newValues: { status: 'APPROVED' }, createdAt: '2026-10-02T00:00:00Z' }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })) };
    await TestBed.configureTestingModule({ imports: [AdminAuditLogPage], providers: [provideRouter([]), { provide: AdminService, useValue: api }, { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }] }).compileComponents();
    fixture = TestBed.createComponent(AdminAuditLogPage); fixture.detectChanges();
  });

  it('submits bounded audit filters and renders before/after details', () => {
    const component = fixture.componentInstance as unknown as { adminId: string; action: string; entityType: string; dateFrom: string; dateTo: string; load(page: number): void };
    Object.assign(component, { adminId: '2', action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    component.load(1); fixture.detectChanges();
    expect(api.auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ adminId: 2, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', dateFrom: '2026-10-01', dateTo: '2026-10-31' }));
    expect(fixture.nativeElement.textContent).toContain('Pending');
    expect(fixture.nativeElement.textContent).toContain('Approved');
    expect(fixture.nativeElement.textContent).toContain('Reservation status updated');
    expect(fixture.nativeElement.textContent).toContain('8:00 AM');
    expect(fixture.nativeElement.querySelector('pre')).toBeNull();
    expect(fixture.nativeElement.querySelector('select[name="action"]')).toBeTruthy();
  });

  it('keeps field values accurate while formatting money, time, booleans and missing values', () => {
    const component = fixture.componentInstance as unknown as {
      changes(item: unknown): { label: string; before: string; after: string }[];
    };
    const changes = component.changes({ oldValues: { amountPaid: 0, status: 'AWAITING_PAYMENT', eventTime: '18:00', isActive: false },
      newValues: { amountPaid: 12500, status: 'CANCELLED', eventTime: '20:00', isActive: true, reason: 'Customer request', reference: 'REF_123' } });
    expect(changes).toContainEqual({ label: 'Amount paid', before: 'PHP 0.00', after: 'PHP 12,500.00' });
    expect(changes).toContainEqual({ label: 'Status', before: 'Awaiting payment', after: 'Cancelled' });
    expect(changes).toContainEqual({ label: 'Event time', before: '6:00 PM', after: '8:00 PM' });
    expect(changes).toContainEqual({ label: 'Active', before: 'No', after: 'Yes' });
    expect(changes).toContainEqual({ label: 'Reason', before: 'Not recorded', after: 'Customer request' });
    expect(changes).toContainEqual({ label: 'Reference', before: 'Not recorded', after: 'REF_123' });
  });
});

