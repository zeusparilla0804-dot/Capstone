import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomEventService } from '../../core/services/custom-event.service';
import { CustomEventDetailPage } from './custom-event-detail.page';

const detail = {
  id: 12, reservationId: 31, reference: 'CQ-2026-ABCDEF12', eventType: 'Wedding', eventDate: '2098-10-20',
  eventTime: '18:00', venue: 'Panorama Ville', guestCount: 120, sourcePackageId: 4, sourcePackageName: 'Ruby',
  targetBudget: 150000, menuPreferences: 'Filipino buffet', dietaryNotes: null, setupPreferences: null,
  requestedServices: ['Coffee bar'], specialRequests: null, status: 'QUOTE_SENT' as const, clarificationReason: null,
  rejectionReason: null, createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z',
  currentQuote: { id: 9, requestId: 12, version: 2, subtotal: 2600, discount: 0, total: 2600,
    requiredDownPayment: 780, validUntil: '2098-12-31', terms: 'Valid for this event.', status: 'SENT' as const,
    sentAt: '2026-10-12T00:00:00Z', acceptedAt: null, declinedAt: null, createdAt: '2026-10-12T00:00:00Z',
    items: [{ id: 1, quoteId: 9, sortOrder: 1, description: 'Buffet service', quantity: 100, unitPrice: 26, lineTotal: 2600 }] },
  quoteHistory: [],
};

describe('CustomEventDetailPage', () => {
  it('shows quotation status and hides billing until acceptance while preventing duplicate decisions', async () => {
    let finish!: () => void;
    const accept = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    TestBed.configureTestingModule({ imports: [CustomEventDetailPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '12' }) } } },
      { provide: CustomEventService, useValue: { detail: () => of(detail), accept, decline: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(CustomEventDetailPage);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Quotation ready');
    expect(fixture.nativeElement.textContent).toContain('Buffet service');
    expect(fixture.nativeElement.textContent).not.toContain('View billing');
    const component = fixture.componentInstance as any;
    component.openDecision('accept');
    const first = component.confirmDecision(); const second = component.confirmDecision();
    expect(accept).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first, second]);
  });

  it('shows a declined first quotation as closed history instead of an in-progress request', async () => {
    const declinedQuote = {
      ...detail.currentQuote,
      status: 'DECLINED' as const,
      sentAt: '2026-10-12T00:00:00Z',
      declinedAt: '2026-10-13T00:00:00Z',
    };
    const declinedDetail = {
      ...detail,
      status: 'DECLINED' as const,
      currentQuote: null,
      quoteHistory: [declinedQuote],
    };
    TestBed.configureTestingModule({ imports: [CustomEventDetailPage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '12' }) } } },
      { provide: CustomEventService, useValue: { detail: () => of(declinedDetail), accept: vi.fn(), decline: vi.fn() } },
    ] });
    const fixture = TestBed.createComponent(CustomEventDetailPage);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This request is closed');
    expect(fixture.nativeElement.textContent).toContain('Version 2');
    expect(fixture.nativeElement.textContent).toContain('declined');
    expect(fixture.nativeElement.textContent).not.toContain('quotation is being shaped');
  });
});
