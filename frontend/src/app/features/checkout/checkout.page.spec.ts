import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { CheckoutPageComponent } from './checkout.page';

describe('Checkout editing and selection integrity', () => {
  function setup() {
    const pkg = { id: '1', category: 'wedding', pricingType: 'PER_HEAD', pricePerGuest: 500 };
    const bookings = { submitDraft: vi.fn(async () => 'NEW'), updatePendingBooking: vi.fn(async () => ({ reference: 'ORIGINAL' })) };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([]),
      { provide: BookingService, useValue: bookings },
      { provide: PackageService, useValue: { getPackageById: () => pkg } },
    ] });
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.update({ eventType: 'wedding', eventDate: '2098-06-15', eventTime: '12:00', venue: 'Updated', guestCount: 50, packageId: '1', paymentMethod: 'bank-transfer' });
    draft.addOnsLoaded?.set(true);
    return { draft, bookings, component: TestBed.createComponent(CheckoutPageComponent).componentInstance as any };
  }

  it('saves the original pending reservation through the full billing summary', async () => {
    const { draft, bookings, component } = setup();
    if (draft.editingBookingId) draft.editingBookingId.set('27');
    const savedDraft = draft.draft();
    const savedPackage = draft.selectedPackage();
    await component.confirmBooking();
    expect(bookings.updatePendingBooking).toHaveBeenCalledWith('27', savedDraft, savedPackage, []);
    expect(bookings.submitDraft).not.toHaveBeenCalled();
    expect(component.bookingReference()).toBe('ORIGINAL');
  });

  it('preserves selected add-ons when the catalog is unavailable instead of submitting a deletion', async () => {
    const { draft, bookings, component } = setup();
    draft.update({ selectedAddOnIds: ['5'] });
    draft.addOnsError.set('Unable to load add-ons.');
    await component.confirmBooking();
    expect(bookings.submitDraft).not.toHaveBeenCalled();
    expect(draft.draft().selectedAddOnIds).toEqual(['5']);
    expect(component.errorMessage()).toContain('add-ons');
  });

  it('uses the shared draft submission UUID when creating through the billing summary', async () => {
    const { draft, bookings, component } = setup();
    const sharedKey = draft.submissionKey?.();
    await component.confirmBooking();
    expect(sharedKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect((bookings.submitDraft.mock.calls[0] as unknown[] | undefined)?.[3]).toBe(sharedKey);
    expect(draft.submissionKey()).not.toBe(sharedKey);
  });
});
