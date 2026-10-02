import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import type { BookingStatus, BookingTab } from '../models';
import { BookingService } from './booking.service';

describe('BookingService cancellation', () => {
  let service: BookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BookingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends the trimmed reason with the customer cancellation request', async () => {
    const pending = Reflect.apply(service.cancelBooking, service, ['5', '  Plans changed  ']) as Promise<boolean>;
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/5/cancel`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ reason: 'Plans changed' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await expect(pending).resolves.toBe(true);
  });

  it('shows every backend booking status in exactly one appropriate tab', () => {
    const expected = {
      pending: 'upcoming', approved: 'upcoming', awaiting_payment: 'upcoming',
      payment_submitted: 'upcoming', payment_verified: 'upcoming', confirmed: 'upcoming',
      completed: 'past', rejected: 'rejected', cancelled: 'cancelled'
    } as const satisfies Record<BookingStatus, BookingTab>;
    const statuses = Object.keys(expected) as (keyof typeof expected)[];
    service.loadMine();
    http.expectOne(`${environment.apiBaseUrl}/bookings/my`).flush({ success: true, data: statuses.map((status, index) => ({
      id: index + 1, reference: `LC-${index + 1}`, customerId: '7', eventName: 'Event', eventType: 'wedding',
      eventDate: '2026-10-10', eventTime: '12:00', venue: 'Venue', guestCount: 50,
      package: { packageId: 1, packageName: 'Package', pricePerGuest: 200 }, addOns: [],
      discount: 0, total: 10000, status, amountPaid: 0, createdAt: '2026-10-01'
    })) });

    const tabs: BookingTab[] = ['upcoming', 'past', 'cancelled', 'rejected'];
    for (const status of statuses) {
      const visibleIn = tabs.filter(tab => service.getBookingsByTab(tab).some(booking => booking.status === status));
      expect(visibleIn, status).toEqual([expected[status]]);
    }
  });
});
