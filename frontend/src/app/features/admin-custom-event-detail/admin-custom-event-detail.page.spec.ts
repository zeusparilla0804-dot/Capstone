import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import type { AdminCustomEventDetail } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminCustomEventDetailPage } from './admin-custom-event-detail.page';

const detail: AdminCustomEventDetail = {
  id: 18, reservationId: 81, reference: 'LC-0081', eventType: 'Wedding', eventDate: '2026-12-18',
  eventTime: '18:00', venue: 'Santa Rosa, Laguna', guestCount: 120, sourcePackageId: 4,
  sourcePackageName: 'Diamond', targetBudget: 150000, menuPreferences: 'Filipino buffet',
  dietaryNotes: 'Two vegetarian guests', setupPreferences: 'Warm white florals',
  requestedServices: ['Catering', 'Styling'], specialRequests: 'Include a welcome table.',
  status: 'AWAITING_QUOTE', clarificationReason: null, rejectionReason: null,
  createdAt: '2026-10-12T08:00:00.000Z', updatedAt: '2026-10-12T08:00:00.000Z',
  currentQuote: null,
  quoteHistory: [{
    id: 9, requestId: 18, version: 1, subtotal: 120000, discount: 0, total: 120000,
    requiredDownPayment: 36000, validUntil: '2026-11-01', terms: null, status: 'SUPERSEDED',
    sentAt: '2026-10-12T09:00:00.000Z', acceptedAt: null, declinedAt: null,
    createdAt: '2026-10-12T09:00:00.000Z', items: [{
      id: 1, quoteId: 9, sortOrder: 1, description: 'Full catering service', quantity: 120,
      unitPrice: 1000, lineTotal: 120000,
    }],
  }],
};

describe('AdminCustomEventDetailPage', () => {
  let fixture: ComponentFixture<AdminCustomEventDetailPage>;
  let sendResult: Subject<unknown>;
  let api: {
    customEvent: ReturnType<typeof vi.fn>;
    sendCustomQuote: ReturnType<typeof vi.fn>;
    requestCustomClarification: ReturnType<typeof vi.fn>;
    rejectCustomEvent: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sendResult = new Subject();
    api = {
      customEvent: vi.fn(() => of({ success: true, data: detail })),
      sendCustomQuote: vi.fn(() => sendResult.asObservable()),
      requestCustomClarification: vi.fn(() => of({ success: true })),
      rejectCustomEvent: vi.fn(() => of({ success: true })),
    };
    await TestBed.configureTestingModule({
      imports: [AdminCustomEventDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '18' }) } } },
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminCustomEventDetailPage);
    fixture.detectChanges();
  });

  it('renders the operational brief and superseded quote history', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('LC-0081');
    expect(text).toContain('Filipino buffet');
    expect(text).toContain('Warm white florals');
    expect(text).toContain('Version 1');
    expect(text).toContain('Superseded');
  });

  it('calculates decimal line totals and blocks an invalid quote', () => {
    const component = fixture.componentInstance as unknown as {
      lines: Array<{ description: string; quantity: number; unitPrice: number }>;
      requiredDownPayment: number;
      validUntil: string;
      quoteTotal(): number;
      requestSendConfirmation(): void;
    };
    component.lines = [{ description: 'Catering service', quantity: 2.5, unitPrice: 199.99 }];
    expect(component.quoteTotal()).toBe(499.98);

    component.requiredDownPayment = 600;
    component.validUntil = '2026-12-31';
    component.requestSendConfirmation();
    fixture.detectChanges();
    expect(api.sendCustomQuote).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('cannot exceed the quotation total');
  });

  it('requires confirmation and prevents duplicate quote submissions', () => {
    const component = fixture.componentInstance as unknown as {
      lines: Array<{ description: string; quantity: number; unitPrice: number }>;
      requiredDownPayment: number;
      validUntil: string;
      requestSendConfirmation(): void;
      confirmSendQuote(): void;
    };
    component.lines = [{ description: 'Catering service', quantity: 120, unitPrice: 950 }];
    component.requiredDownPayment = 34200;
    component.validUntil = '2026-12-31';
    component.requestSendConfirmation();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Confirm quotation');
    expect(api.sendCustomQuote).not.toHaveBeenCalled();

    component.confirmSendQuote();
    component.confirmSendQuote();
    expect(api.sendCustomQuote).toHaveBeenCalledTimes(1);
  });

  it('requires a reason before clarification or rejection', () => {
    const component = fixture.componentInstance as unknown as {
      openDisposition(mode: 'clarify' | 'reject'): void;
      submitDisposition(): void;
    };
    component.openDisposition('clarify');
    component.submitDisposition();
    fixture.detectChanges();
    expect(api.requestCustomClarification).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a reason');
  });
});
