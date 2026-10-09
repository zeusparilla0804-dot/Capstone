import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { BookingAvailability, BookingDraft, CateringPackage } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { BookingPageComponent } from './booking.page';

const pkg: CateringPackage = {
  id: '10', name: 'Intimate Wedding Table', category: 'wedding', description: 'Package',
  pricePerGuest: 720, imageUrl: 'assets/images/packages/wedding/wedding-wide.png', features: [],
  minGuests: 30, maxGuests: 80,
};

const initialDraft: BookingDraft = {
  eventType: 'wedding', eventDate: '2027-01-10', eventTime: '2:00 PM', venue: 'Venue',
  guestCount: 30, packageId: pkg.id, selectedAddOnIds: [], paymentMethod: 'gcash',
};

describe('BookingPageComponent submission validation', () => {
  let draftState: ReturnType<typeof signal<BookingDraft>>;
  let resetDraft: ReturnType<typeof vi.fn>;
  let bookingService: {
    submitDraft: ReturnType<typeof vi.fn>;
    checkAvailability: ReturnType<typeof vi.fn>;
  };

  const availability = (status: BookingAvailability['status'], date = initialDraft.eventDate): BookingAvailability => ({
    date,
    guestCount: initialDraft.guestCount,
    status,
    activeBookingCount: status === 'FULL' ? 6 : 1,
    capacityLimit: 6,
    remainingRequestSlots: status === 'FULL' || status === 'LIMITED' ? 0 : 4,
    requiresAdminConfirmation: status === 'NEEDS_CONFIRMATION',
    message: status === 'FULL' ? 'This date is fully booked for the requested event size.' : `${status} message`,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    draftState = signal(initialDraft);
    resetDraft = vi.fn();
    bookingService = {
      submitDraft: vi.fn(async () => 'BK-TEST'),
      checkAvailability: vi.fn(() => of(availability('AVAILABLE'))),
    };
    const draftService = {
      draft: draftState.asReadonly(), selectedPackage: signal(pkg), selectedAddOns: signal<[]>([]),
      pricing: signal({ packageTotal: 21600, addOnTotal: 0, subtotal: 21600, discount: 0, total: 21600, downPayment: 6480, remainingBalance: 15120 }),
      addOns: signal([]), loadAddOns: () => undefined, toggleAddOn: () => undefined,
      selectPackage: (id: string) => draftState.update(value => ({ ...value, packageId: id })),
      update: (value: Partial<BookingDraft>) => draftState.update(current => ({ ...current, ...value })),
      reset: resetDraft,
    };
    const packageService = {
      packages: signal<readonly CateringPackage[]>([pkg]), load: () => undefined,
      getPackageById: (id: string) => id === pkg.id ? pkg : undefined,
    };
    TestBed.configureTestingModule({
      imports: [BookingPageComponent],
      providers: [
        { provide: BookingDraftService, useValue: draftService },
        { provide: BookingService, useFactory: () => bookingService },
        { provide: PackageService, useValue: packageService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('keeps the customer on event details when guests exceed the selected package range', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    component.eventForm.setValue({
      eventType: 'wedding', eventDate: '2027-01-10', eventTime: '2:00 PM', venue: 'Venue',
      guestCount: 1000, packageId: pkg.id,
    });

    component.continueToAddOns();

    expect(component.currentStep()).toBe(1);
    expect(component.eventForm.controls.guestCount.errors?.packageRange).toBe(true);
  });

  it('shows the backend validation reason when confirmation is rejected', async () => {
    bookingService.submitDraft.mockRejectedValue(new HttpErrorResponse({
        status: 400,
        error: { message: 'Guest count must be between 30 and 80.' },
      }));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    await component.confirmBooking();

    expect(component.submissionError()).toBe('Guest count must be between 30 and 80.');
  });

  it('debounces checks and ignores a stale response after the date changes', () => {
    const first = new Subject<BookingAvailability>();
    const second = new Subject<BookingAvailability>();
    bookingService.checkAvailability.mockImplementation((date: string) => date === '2027-01-10' ? first : second);
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    vi.advanceTimersByTime(300);
    expect(bookingService.checkAvailability).toHaveBeenCalledWith('2027-01-10', 30);
    component.eventForm.controls.eventDate.setValue('2027-01-11');
    expect(component.canContinueToAddOns()).toBe(false);
    vi.advanceTimersByTime(300);
    first.next(availability('AVAILABLE', '2027-01-10'));
    expect(component.canContinueToAddOns()).toBe(false);
    second.next(availability('LIMITED', '2027-01-11'));

    expect(component.availabilityState().data.status).toBe('LIMITED');
    expect(component.canContinueToAddOns()).toBe(true);
  });

  it('rechecks the same availability query after an invalid value is restored', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    vi.advanceTimersByTime(300);
    expect(bookingService.checkAvailability).toHaveBeenCalledTimes(1);
    component.eventForm.controls.eventDate.setValue('');
    vi.advanceTimersByTime(300);
    component.eventForm.controls.eventDate.setValue(initialDraft.eventDate);
    vi.advanceTimersByTime(300);

    expect(bookingService.checkAvailability).toHaveBeenCalledTimes(2);
    expect(component.availabilityState().phase).toBe('ready');
    expect(component.canContinueToAddOns()).toBe(true);
  });

  it('allows available, limited, and review states but blocks a full date', () => {
    bookingService.checkAvailability.mockImplementation(() => of(availability('AVAILABLE')));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    for (const status of ['AVAILABLE', 'LIMITED', 'NEEDS_CONFIRMATION', 'FULL'] as const) {
      bookingService.checkAvailability.mockReturnValue(of(availability(status)));
      component.eventForm.controls.guestCount.setValue(status === 'AVAILABLE' ? 30 : status === 'LIMITED' ? 31 : status === 'NEEDS_CONFIRMATION' ? 32 : 33);
      vi.advanceTimersByTime(300);
      expect(component.availabilityState().data.status).toBe(status);
      expect(component.canContinueToAddOns()).toBe(status !== 'FULL');
    }
  });

  it('shows a failed check and retries the current date and guest count', () => {
    bookingService.checkAvailability
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(availability('AVAILABLE')));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    vi.advanceTimersByTime(300);
    expect(component.availabilityState().phase).toBe('error');
    component.retryAvailability();

    expect(bookingService.checkAvailability).toHaveBeenCalledTimes(2);
    expect(component.availabilityState().data.status).toBe('AVAILABLE');
    expect(component.canContinueToAddOns()).toBe(true);
  });

  it('preserves the draft and returns to focused date feedback after a stale capacity conflict', async () => {
    bookingService.submitDraft.mockRejectedValue(new HttpErrorResponse({
      status: 409,
      error: { code: 'CAPACITY_CHANGED', message: 'Date capacity changed. Choose another date.' },
    }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    vi.advanceTimersByTime(300);
    component.currentStep.set(4);
    fixture.detectChanges();

    await component.confirmBooking();
    fixture.detectChanges();
    vi.runOnlyPendingTimers();

    expect(component.currentStep()).toBe(1);
    expect(resetDraft).not.toHaveBeenCalled();
    expect(draftState()).toEqual(initialDraft);
    expect(component.submissionError()).toBe('Date capacity changed. Choose another date.');
    expect(component.availabilityConflictMessage()).toBe('Date capacity changed. Choose another date.');
    expect(document.activeElement?.id).toBe('availability-feedback');
  });
});
