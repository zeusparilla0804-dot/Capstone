import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
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
});
