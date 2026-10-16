import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { BookingAvailability, BookingDraft, BookingStatus, BookingTab, CateringPackage } from '../models';
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

  it('maps booking thumbnails to assets that exist in the package image directory', () => {
    service.loadMine();
    http.expectOne(`${environment.apiBaseUrl}/bookings/my`).flush({
      success: true,
      data: [{
        id: 1, reference: 'LC-1', customerId: '7', eventName: 'Wedding', eventType: 'wedding',
        eventDate: '2026-12-10', eventTime: '12:00', venue: 'Venue', guestCount: 50,
        package: { packageId: 1, packageName: 'Package', pricePerGuest: 200 }, addOns: [],
        discount: 0, total: 10000, status: 'pending', amountPaid: 0, createdAt: '2026-10-01'
      }],
    });

    expect(service.bookings()[0]?.thumbnailUrl).toBe('assets/images/packages/premium-package.webp');
  });

  it('submits GCash as the backend e-wallet payment method', async () => {
    const draft: BookingDraft = {
      eventType: 'wedding', eventDate: '2026-12-10', eventTime: '2:00 PM', venue: 'Venue',
      guestCount: 50, packageId: '1', selectedAddOnIds: [], paymentMethod: 'gcash', specialRequest: 'No shellfish.',
    };
    const pkg: CateringPackage = {
      id: '1', name: 'Wedding Package', category: 'wedding', description: 'Package',
      pricingType: 'PER_HEAD', pricePerGuest: 500, basePrice: null, includedGuests: null,
      excessGuestPrice: null, minGuests: null, maxGuests: null,
      imageUrl: 'assets/images/packages/premium-package.webp', features: [],
    };

    const pending = service.submitDraft(draft, pkg, []);
    const request = http.expectOne(`${environment.apiBaseUrl}/bookings`);
    expect(request.request.body.paymentMethod).toBe('e-wallet');
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
      guestCount: 60, packageId: 1, addOnIds: [5], paymentMethod: 'bank-transfer', specialRequest: 'White linens.',
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
