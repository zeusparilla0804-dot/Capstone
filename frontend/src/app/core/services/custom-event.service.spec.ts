import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CustomEventService } from './custom-event.service';

describe('CustomEventService', () => {
  it('uses authenticated customer endpoints without accepting client totals', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(CustomEventService);
    const http = TestBed.inject(HttpTestingController);
    const input = { eventType: 'Wedding', eventDate: '2098-10-20', eventTime: '18:00', venue: 'Panorama Ville',
      guestCount: 120, sourcePackageId: 4, targetBudget: 150000, requestedServices: ['Coffee bar'] };
    const submit = service.submit(input);
    const request = http.expectOne(`${environment.apiBaseUrl}/custom-events`);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual(input);
    expect(request.request.body.total).toBeUndefined();
    request.flush({ success: true, data: { id: 12, reservationId: 31, reference: 'CQ-2026-A', status: 'AWAITING_QUOTE' } });
    expect((await submit).id).toBe(12);

    const accept = service.accept(12, 9);
    http.expectOne(`${environment.apiBaseUrl}/custom-events/12/quotes/9/accept`).flush({ success: true });
    await accept;
    const decline = service.decline(12, 9, 'Plans changed');
    const declineRequest = http.expectOne(`${environment.apiBaseUrl}/custom-events/12/quotes/9/decline`);
    expect(declineRequest.request.body).toEqual({ reason: 'Plans changed' });
    declineRequest.flush({ success: true });
    await decline;
  });
});
