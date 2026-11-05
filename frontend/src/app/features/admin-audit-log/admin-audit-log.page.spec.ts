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
    api = { auditLog: vi.fn(() => of({ success: true, data: { items: [{ id: '91', adminId: 2, adminUsername: 'admin', action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: 42, oldValues: { status: 'PENDING' }, newValues: { status: 'APPROVED' }, createdAt: '2026-10-02' }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })) };
    await TestBed.configureTestingModule({ imports: [AdminAuditLogPage], providers: [provideRouter([]), { provide: AdminService, useValue: api }, { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }] }).compileComponents();
    fixture = TestBed.createComponent(AdminAuditLogPage); fixture.detectChanges();
  });

  it('submits bounded audit filters and renders before/after details', () => {
    const component = fixture.componentInstance as unknown as { adminId: string; action: string; entityType: string; dateFrom: string; dateTo: string; load(page: number): void };
    Object.assign(component, { adminId: '2', action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', dateFrom: '2026-10-01', dateTo: '2026-10-31' });
    component.load(1); fixture.detectChanges();
    expect(api.auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ adminId: 2, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', dateFrom: '2026-10-01', dateTo: '2026-10-31' }));
    expect(fixture.nativeElement.textContent).toContain('PENDING');
    expect(fixture.nativeElement.textContent).toContain('APPROVED');
  });
});

