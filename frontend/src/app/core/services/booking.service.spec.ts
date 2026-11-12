import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { BookingAvailability, BookingDraft, BookingStatus, BookingTab, CateringPackage } from '../models';
import { BookingService } from './booking.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

const submissionKey = '56df1d5f-10d0-463c-8035-143b1046643b';

describe('BookingService cancellation', () => {
  let service: BookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BookingService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('rejects a cached GCash choice before making an API request', async () => {
    await expect(service.choosePaymentMethod('27', 'gcash')).rejects.toThrow(/cash.*bank transfer/i);
    http.expectNone(`${environment.apiBaseUrl}/bookings/27/payment-method`);
  });

  it('shows the latest created reservation first even when its event is later', () => {
    (service as any).state.set([
      { id: '1', status: 'confirmed', eventDate: '2026-11-09', createdAt: '2026-11-01T09:00:00.000Z' },
      { id: '2', status: 'pending', eventDate: '2026-11-10', createdAt: '2026-11-06T09:00:00.000Z' },
    ]);
    expect(service.getBookingsByTab('upcoming').map(item => item.id)).toEqual(['2', '1']);
  });

  it('chooses payment for an approved booking through its owner-scoped endpoint', async () => {
    const selected = service.choosePaymentMethod('27', 'bank-transfer').catch(error => error);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/27/payment-method`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ method: 'bank-transfer' });
    request.flush({ success: true, data: { id: 27, reference: 'BK-27', eventType: 'wedding', package: { packageId: 1 }, addOns: [] } });
    expect((await selected).id).toBe('27');
  });

  it('retries an uncertain create with the same submission key and canonical request details', async () => {
    const draft = { eventType: 'wedding', eventDate: '2098-06-15', eventTime: '12:00', venue: 'Venue',
      guestCount: 50, selectedAddOnIds: [], paymentMethod: 'bank-transfer' } as any;
    const first = (service.submitDraft as any)(draft, { id: '1' }, [], submissionKey).catch((error: unknown) => error);
    const initial = http.expectOne(`${environment.apiBaseUrl}/bookings`);
    expect(initial.request.headers.get('Idempotency-Key')).toBe(submissionKey);
    initial.error(new ProgressEvent('error'));
    await first;
    const retry = (service.submitDraft as any)({ ...draft, venue: ' Venue ' }, { id: '1' }, [], submissionKey).catch((error: unknown) => error);
    const repeated = http.expectOne(`${environment.apiBaseUrl}/bookings`);
    expect(repeated.request.headers.get('Idempotency-Key')).toBe(submissionKey);
    repeated.flush({}, { status: 503, statusText: 'Unavailable' });
    await retry;
  });

  it('blocks changed request details after an uncertain create instead of silently creating another booking', async () => {
    const draft = { selectedAddOnIds: [], eventTime: '12:00', venue: 'Original venue' } as any;
    const first = (service.submitDraft as any)(draft, { id: '1' }, [], submissionKey).catch((error: unknown) => error);
    http.expectOne(`${environment.apiBaseUrl}/bookings`).error(new ProgressEvent('error'));
    await first;
    await expect((service.submitDraft as any)({ ...draft, venue: 'Changed venue' }, { id: '1' }, [], submissionKey)).rejects.toThrow(/review your reservations/i);
    http.expectNone(`${environment.apiBaseUrl}/bookings`);
  });

  it('allows corrected details after a definitive rejection without changing the submission key', async () => {
    const draft = { selectedAddOnIds: [], eventTime: '12:00', venue: 'Original venue' } as any;
    const first = (service.submitDraft as any)(draft, { id: '1' }, [], submissionKey).catch((error: unknown) => error);
    http.expectOne(`${environment.apiBaseUrl}/bookings`).flush({ code: 'BOOKING_DATE_FULL' }, { status: 409, statusText: 'Conflict' });
    await first;
    const corrected = (service.submitDraft as any)({ ...draft, venue: 'Changed venue' }, { id: '1' }, [], submissionKey).catch((error: unknown) => error);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings`);
    expect(request.request.headers.get('Idempotency-Key')).toBe(submissionKey);
    request.flush({}, { status: 400, statusText: 'Bad Request' });
    await corrected;
  });

  it('clears cached bookings synchronously on account switch and cancels the prior account request', () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    scope.setPrincipal('A');
    service.loadMine();
    const oldRequest = http.expectOne(`${environment.apiBaseUrl}/bookings/my`);
    scope.setPrincipal('B');
    expect(oldRequest.cancelled).toBe(true);
    expect(service.bookings()).toEqual([]);
    expect(service.loading()).toBe(false);
    service.loadMine();
    http.expectOne(`${environment.apiBaseUrl}/bookings/my`).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(service.bookings()).toEqual([]);
  });

  it('does not return a prior-account booking detail response to its subscriber', async () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    scope.setPrincipal('A');
    const pending = firstValueFrom(service.loadBookingById('27')).catch(error => error);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/27`);
    scope.setPrincipal('B');
    expect(request.cancelled).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
    expect(service.bookings()).toEqual([]);
  });

  it('sends the pending reservation identifier for owner-scoped edit availability', () => {
    (service.checkAvailability as any)('2098-06-15', 1000, '27').subscribe();
    const request = http.expectOne(req => req.url.endsWith('/bookings/availability'));
    expect(request.request.params.get('reservationId')).toBe('27');
    request.flush({ success: true, data: {} });
  });
  it('loads a whole month of date availability for the selected guest count', () => {
    service.checkMonthAvailability('2026-11', 500).subscribe(result => {
      expect(result).toEqual([{ date: '2026-11-10', status: 'FULL' }]);
    });
    const request = http.expectOne(req => req.url.endsWith('/bookings/availability/month'));
    expect(request.request.params.get('guestCount')).toBe('500');
    request.flush({ success: true, data: [{ date: '2026-11-10', status: 'FULL' }] });
  });

  it('rejects a payload that silently drops a selected add-on before making an HTTP request', async () => {
    await expect(service.submitDraft({ selectedAddOnIds: ['5'], eventTime: '12:00' } as any, { id: '1' } as any, [], submissionKey)).rejects.toThrow(/add-ons/i);
    http.expectNone(`${environment.apiBaseUrl}/bookings`);
  });

  it('discards a committed booking response when the account changes before its promise resumes', async () => {
    const scope = TestBed.inject(CustomerAccountScopeService);
    scope.setPrincipal('A');
    const pending = service.submitDraft({ selectedAddOnIds: [], eventTime: '12:00' } as any, { id: '1' } as any, [], submissionKey);
    const result = pending.catch(error => error);
    http.expectOne(`${environment.apiBaseUrl}/bookings`).flush({ success: true, data: { reference: 'PRIVATE-A' } });
    scope.setPrincipal('B');
    expect(await result).toBeInstanceOf(Error);
    expect(service.bookings()).toEqual([]);
  });

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
      completed: 'past', rejected: 'rejected', cancelled: 'cancelled', expired: 'cancelled'
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

  it.each([
    ['wedding', 'wedding/client-wedding-01.jpg'],
    ['birthday', 'birthday/client-kids-birthday-01.jpg'],
    ['debut', 'debut/client-debut-11.jpg'],
    ['corporate', 'corporate/client-business-forum-01.jpg'],
    ['anniversary', 'anniversary/client-anniversary-01.jpg'],
    ['other', 'custom/client-private-01.jpg'],
  ])('uses a matching event photo for %s bookings', (eventType, image) => {
    service.loadMine();
    http.expectOne(`${environment.apiBaseUrl}/bookings/my`).flush({
      success: true,
      data: [{
        id: 1, reference: 'LC-1', customerId: '7', eventName: 'Event', eventType,
        eventDate: '2026-12-10', eventTime: '12:00', venue: 'Venue', guestCount: 50,
        package: { packageId: 1, packageName: 'Package', pricePerGuest: 200 }, addOns: [],
        discount: 0, total: 10000, status: 'pending', amountPaid: 0, createdAt: '2026-10-01'
      }],
    });

    expect(service.bookings()[0]?.thumbnailUrl).toBe(`assets/images/packages/${image}`);
  });

  it('submits bank transfer with the backend payment vocabulary', async () => {
    const draft: BookingDraft = {
      eventType: 'wedding', eventDate: '2026-12-10', eventTime: '2:00 PM', venue: 'Venue',
      guestCount: 50, packageId: '1', selectedAddOnIds: [], paymentMethod: 'bank-transfer', specialRequest: 'No shellfish.',
    };
    const pkg: CateringPackage = {
      id: '1', name: 'Wedding Package', category: 'wedding', description: 'Package',
      pricingType: 'PER_HEAD', pricePerGuest: 500, basePrice: null, includedGuests: null,
      excessGuestPrice: null, minGuests: null, maxGuests: null,
      imageUrl: 'assets/images/packages/premium-package.webp', features: [],
    };

    const pending = service.submitDraft(draft, pkg, [], submissionKey);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings`);
    expect(request.request.body.paymentMethod).toBe('bank-transfer');
    expect(request.request.body.specialRequest).toBe('No shellfish.');
    request.flush({ success: true, data: {
      id: 27, reference: 'BK-2026-TEST', total: 25000, eventName: 'Wedding Event', eventType: 'wedding',
      eventDate: draft.eventDate, eventTime: '14:00', venue: draft.venue, guestCount: draft.guestCount,
      package: { packageId: 1, packageName: pkg.name, pricingType: 'PER_HEAD', pricePerGuest: 500,
        basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 25000 }, addOns: [], discount: 0,
      status: 'pending', amountPaid: 0, createdAt: '2026-10-04T00:00:00Z',
    } });
    await expect(pending).resolves.toBe('BK-2026-TEST');
  });

  it('updates pending booking details and replaces the matching local record', async () => {
    const draft: BookingDraft = {
      eventType: 'wedding', eventDate: '2026-12-11', eventTime: '3:00 PM', venue: 'New venue',
      guestCount: 60, packageId: '1', selectedAddOnIds: ['5'], paymentMethod: 'bank-transfer',
      specialRequest: 'White linens.',
    };
    const pkg: CateringPackage = {
      id: '1', name: 'Wedding Package', category: 'wedding', description: 'Package',
      pricingType: 'PER_HEAD', pricePerGuest: 500, basePrice: null, includedGuests: null,
      excessGuestPrice: null, minGuests: null, maxGuests: null,
      imageUrl: 'assets/images/packages/premium-package.webp', features: [],
    };

    const pending = service.updatePendingBooking('27', draft, pkg, [{ id: '5', name: 'Coffee Bar', price: 15_000 }]);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/27/details`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      eventType: 'wedding', eventDate: '2026-12-11', eventTime: '15:00', venue: 'New venue',
      guestCount: 60, packageId: 1, addOnIds: [5], addOnQuantities: { '5': 1 }, paymentMethod: 'bank-transfer', specialRequest: 'White linens.',
    });
    request.flush({ success: true, data: {
      id: 27, reference: 'BK-2026-TEST', total: 45000, eventName: 'Wedding Event', eventType: 'wedding',
      eventDate: draft.eventDate, eventTime: '15:00', venue: draft.venue, guestCount: draft.guestCount,
      specialRequest: draft.specialRequest,
      package: { packageId: 1, packageName: pkg.name, pricingType: 'PER_HEAD', pricePerGuest: 500,
        basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 30000 },
      addOns: [{ id: 5, name: 'Coffee Bar', price: 15000 }], discount: 0,
      status: 'pending', amountPaid: 0, createdAt: '2026-10-04T00:00:00Z',
    } });

    await expect(pending).resolves.toMatchObject({ id: '27', total: 45000, specialRequest: 'White linens.' });
  });

  it('loads one owner-scoped booking so an edit survives a page refresh', async () => {
    const pending = firstValueFrom(service.loadBookingById('27'));
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/27`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ success: true, data: {
      id: 27, reference: 'BK-2026-TEST', total: 45000, eventName: 'Wedding Event', eventType: 'wedding',
      eventDate: '2026-12-11', eventTime: '15:00', venue: 'New venue', guestCount: 60,
      specialRequest: 'White linens.',
      package: { packageId: 1, packageName: 'Wedding Package', pricingType: 'PER_HEAD', pricePerGuest: 500,
        basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 30000 },
      addOns: [{ id: 5, name: 'Coffee Bar', price: 15000 }], discount: 0,
      status: 'pending', amountPaid: 0, createdAt: '2026-10-04T00:00:00Z',
    } });

    await expect(pending).resolves.toMatchObject({ id: '27', specialRequest: 'White linens.' });
    expect(service.getBookingById('27')).toMatchObject({ id: '27', guestCount: 60 });
  });

  it('checks typed availability with encoded query values and customer credentials', async () => {
    const availability: BookingAvailability = {
      date: '2098-06-15', guestCount: 250, status: 'NEEDS_CONFIRMATION', activeBookingCount: 2,
      capacityLimit: 6, remainingRequestSlots: 3, requiresAdminConfirmation: true,
      message: 'LA Chef will confirm whether this date can accommodate your event.',
    };

    const pending = firstValueFrom(service.checkAvailability('2098-06-15', 250));
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/availability?date=2098-06-15&guestCount=250`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ success: true, data: availability, internalReservation: { id: 99 } });

    await expect(pending).resolves.toEqual(availability);
  });
});
