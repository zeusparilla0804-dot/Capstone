import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminEmailOutboxPage } from './admin-email-outbox.page';

describe('AdminEmailOutboxPage', () => {
  let fixture: ComponentFixture<AdminEmailOutboxPage>;
  let retryResult: Subject<unknown>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(async () => {
    retryResult = new Subject();
    api = {
      emailOutbox: vi.fn(() => of({ success: true, data: { items: [{ id: '9007199254740993', recipient: 'customer@example.test', templateKey: 'BOOKING_APPROVED', payload: {}, relatedEntityType: 'BOOKING', relatedEntityId: '42', status: 'FAILED', attemptCount: 3, lastError: 'Mailbox unavailable', createdAt: '2026-10-01', updatedAt: '2026-10-02' }], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } })),
      retryEmail: vi.fn(() => retryResult.asObservable()),
      emailPreview: vi.fn(() => of({ success: true, data: { subject: 'Booking approved | LA Chef', text: 'Preview body', html: '<p>Preview body</p>' } }))
    };
    await TestBed.configureTestingModule({ imports: [AdminEmailOutboxPage], providers: [provideRouter([]), { provide: AdminService, useValue: api }, { provide: AdminAuthService, useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn() } }] }).compileComponents();
    fixture = TestBed.createComponent(AdminEmailOutboxPage);
    fixture.detectChanges();
  });

  it('retries a failed notification once and locks the action while pending', () => {
    const component = fixture.componentInstance as unknown as { retry(id: string): void };
    component.retry('9007199254740993'); component.retry('9007199254740993'); fixture.detectChanges();
    expect(api['retryEmail']).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement.querySelector('[data-testid="retry-email"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('loads a safe email preview without rendering its HTML as application markup', () => {
    const component = fixture.componentInstance as unknown as { preview(id: string): void };
    component.preview('9007199254740993'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Booking approved | LA Chef');
    expect(fixture.nativeElement.textContent).toContain('Preview body');
    const body = fixture.nativeElement.querySelector('.email-preview pre') as HTMLPreElement;
    expect(body.textContent).toBe('Preview body');
    expect(body.querySelector('p')).toBeNull();
  });
});

