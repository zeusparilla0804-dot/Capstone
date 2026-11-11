import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { Booking, BookingAvailability, BookingDraft, CateringPackage } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { BookingPageComponent } from './booking.page';
import { environment } from '../../../environments/environment';
import { stubNativeDialogs } from '../../shared/testing/native-dialog';
import { PaymentDestinationService } from '../../core/services/payment-destination.service';

const pkg: CateringPackage = {
  id: '10', name: 'Intimate Wedding Table', category: 'wedding', description: 'Package',
  pricingType: 'PER_HEAD', pricePerGuest: 720, basePrice: null, includedGuests: null, excessGuestPrice: null,
  imageUrl: 'assets/images/packages/wedding/wedding-wide.png', features: [],
  minGuests: 30, maxGuests: 80,
};
const unboundedPackage: CateringPackage = {
  id: '20', name: 'Amethyst Package', category: 'debut', description: 'Debut package',
  pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: 50,
  excessGuestPrice: 650, minGuests: null, maxGuests: null,
  imageUrl: 'assets/images/packages/debut/debut-wide.png', features: [],
};
const standardPackage: CateringPackage = {
  id: '30', name: 'PHP 580 Per Head', category: 'standard', description: 'General catering package',
  pricingType: 'PER_HEAD', pricePerGuest: 580, basePrice: null, includedGuests: null, excessGuestPrice: null,
  imageUrl: 'assets/images/packages/custom/custom-wide.png', features: [],
  minGuests: null, maxGuests: null,
};

const initialDraft: BookingDraft = {
  eventType: 'wedding', eventDate: '2027-01-10', eventTime: '2:00 PM', venue: 'Venue',
  guestCount: 30, packageId: pkg.id, selectedAddOnIds: [], paymentMethod: 'gcash',
};

describe('BookingPageComponent submission validation', () => {
  let restoreDialogs: () => void;
  let draftState: ReturnType<typeof signal<BookingDraft>>;
  let resetDraft: ReturnType<typeof vi.fn>;
  let routeParams: Record<string, string>;
  let availableMethods: ReturnType<typeof vi.fn>;
  let bookingService: {
    submitDraft: ReturnType<typeof vi.fn>;
    updatePendingBooking: ReturnType<typeof vi.fn>;
    loadBookingById: ReturnType<typeof vi.fn>;
    checkAvailability: ReturnType<typeof vi.fn>;
    checkMonthAvailability: ReturnType<typeof vi.fn>;
    choosePaymentMethod: ReturnType<typeof vi.fn>;
  };

  const editableBooking: Booking = {
    id: '27', reference: 'BK-EDIT', customerId: '', eventName: 'Wedding Event', eventType: 'wedding',
    eventDate: '2027-01-12', eventTime: '15:00', venue: 'Updated Venue', guestCount: 75,
    specialRequest: 'No shellfish.',
    package: { packageId: pkg.id, packageName: pkg.name, pricingType: 'PER_HEAD', pricePerGuest: 720,
      basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 54_000 },
    addOns: [{ id: '5', name: 'Coffee Bar', price: 15_000 }], discount: 0, status: 'pending',
    paymentMethod: 'gcash', amountPaid: 0, createdAt: '2026-10-10T00:00:00Z', thumbnailUrl: 'test.png',
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
    restoreDialogs = stubNativeDialogs();
    vi.useFakeTimers();
    routeParams = {};
    availableMethods = vi.fn(() => of(['BANK_TRANSFER', 'E-WALLET']));
    draftState = signal(initialDraft);
    resetDraft = vi.fn();
    bookingService = {
      submitDraft: vi.fn(async () => 'BK-TEST'),
      choosePaymentMethod: vi.fn(async () => ({ ...editableBooking, status: 'awaiting_payment', paymentMethod: 'gcash' })),
      updatePendingBooking: vi.fn(async () => editableBooking),
      loadBookingById: vi.fn(() => of(editableBooking)),
      checkAvailability: vi.fn(() => of(availability('AVAILABLE'))),
      checkMonthAvailability: vi.fn(() => of([
        { date: '2026-11-10', status: 'FULL' }, { date: '2026-11-11', status: 'AVAILABLE' },
      ])),
    };
    const draftService = {
      submissionKey: signal('56df1d5f-10d0-463c-8035-143b1046643b'),
      editingBookingId: signal<string | null>(null),
      catalogSelectionError: signal(''), addOnsLoading: signal(false), addOnsError: signal(''),
      missingAddOnIds: signal<string[]>([]), removeUnavailableAddOns: () => undefined,
      incompatibleAddOnIds: signal<string[]>([]), availableAddOns: signal([]),
      unlockedStep: signal<1 | 2 | 3 | 4>(1),
      draft: draftState.asReadonly(), selectedPackage: signal(pkg), selectedAddOns: signal<[]>([]),
      pricing: signal({ packageTotal: 21600, addOnTotal: 0, subtotal: 21600, discount: 0, total: 21600, downPayment: 10800, remainingBalance: 10800 }),
      addOns: signal([]), loadAddOns: () => undefined, toggleAddOn: () => undefined,
      selectPackage: (id: string) => draftState.update(value => ({ ...value, packageId: id })),
      update: (value: Partial<BookingDraft>) => draftState.update(current => ({ ...current, ...value })),
      reset: resetDraft,
    };
    const packages = [pkg, unboundedPackage, standardPackage] as const;
    const packageService = {
      packages: signal<readonly CateringPackage[]>(packages), load: () => undefined,
      getPackageById: (id: string) => packages.find(item => item.id === id),
    };
    TestBed.configureTestingModule({
      imports: [BookingPageComponent],
      providers: [
        { provide: BookingDraftService, useValue: draftService },
        { provide: BookingService, useFactory: () => bookingService },
        { provide: PackageService, useValue: packageService },
        { provide: PaymentDestinationService, useValue: { availableMethods } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => routeParams[key] ?? null } } } },
      ],
    });
    vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => { TestBed.resetTestingModule(); restoreDialogs(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('returns to the dashboard with the submitted reference after a successful request', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    await component.confirmBooking();
    expect(resetDraft).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/dashboard'], { state: { bookingReference: 'BK-TEST', bookingUpdated: false } });
  });

  it('keeps failed requests on the booking page with their draft intact', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    bookingService.submitDraft.mockRejectedValue(new Error('Offline'));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    await component.confirmBooking();
    expect(navigate).not.toHaveBeenCalled();
    expect(resetDraft).not.toHaveBeenCalled();
  });

  it('keeps the selected package fixed and explains preparation and venue requirements upfront', () => {
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('select#packageId')).toBeNull();
    expect(page.querySelector('#packageId')?.textContent).toContain(pkg.name);
    expect((fixture.componentInstance as any).eventForm.getRawValue().packageId).toBe(pkg.id);
    expect(page.querySelector('#date-preparation-note')?.textContent).toContain('500 or more');
    expect(page.querySelector('#venue-address-note')?.textContent).toContain('complete address');
  });

  it('shows one photobooth selector, coffee inclusions, and the itemized add-ons total', () => {
    const { fixture, draft, component } = chairQuantityFixture();
    draft.addOns.set([...draft.addOns(),
      { id: 'basic', name: 'Basic Photobooth (2 Hours Unlimited)', price: 4000 },
      { id: 'mirror', name: 'Mirror Photobooth (2 Hours Unlimited)', price: 10000 },
      { id: 'coffee', name: 'Coffee Bar for 50 Guests', price: 15000 },
      { id: 'coffee100', name: 'Coffee Bar for 100 Guests', price: 22000 },
    ]);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('#addon-basic')).toBeNull();
    expect(page.querySelector('#addon-mirror')).toBeNull();
    const inclusions = [...page.querySelectorAll('.coffee-inclusions')].map(item => item.textContent);
    expect(inclusions).toEqual(['Includes coffee service and cookies for 50 guests.', 'Includes coffee service, cookies, and light snacks for 100 guests.']);
    expect(page.querySelector('#photobooth-choice')).toBeNull();
    const checkbox = page.querySelector('#addon-photobooth') as HTMLInputElement;
    checkbox.click(); fixture.detectChanges();
    expect(checkbox.closest('.selection-row')?.classList.contains('is-selected')).toBe(true);
    const select = page.querySelector('#photobooth-choice') as HTMLSelectElement;
    select.value = 'basic'; select.dispatchEvent(new Event('change'));
    select.value = 'mirror'; select.dispatchEvent(new Event('change'));
    expect(draft.draft().selectedAddOnIds).toEqual(['chair', 'lechon', 'mirror']);
    component.currentStep.set(3);
    fixture.detectChanges();
    expect(page.querySelector('.review-addons-total')?.textContent).toContain('24,100');
    expect(page.querySelector('.review-addons')?.textContent).not.toContain('Basic Photobooth');
    component.currentStep.set(2); fixture.detectChanges();
    (page.querySelector('#addon-photobooth') as HTMLInputElement).click(); fixture.detectChanges();
    expect(draft.draft().selectedAddOnIds).toEqual(['chair', 'lechon']);
    expect(page.querySelector('#photobooth-choice')).toBeNull();
  });

  it('offers Cash and only online methods that have an available QR', () => {
    routeParams['paymentBooking'] = '27';
    availableMethods.mockReturnValue(of(['BANK_TRANSFER']));
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    const choices = [...fixture.nativeElement.querySelectorAll('input[name="approvedPaymentMethod"]')].map((input: any) => input.value);
    expect(choices).toEqual(['cash', 'bank-transfer']);
    (fixture.componentInstance as any).selectApprovedPayment('gcash');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-payment-choice-dialog')).toBeNull();
    expect(bookingService.choosePaymentMethod).not.toHaveBeenCalled();
  });

  it('keeps Cash available if QR availability cannot load and allows retrying', () => {
    routeParams['paymentBooking'] = '27';
    availableMethods.mockReturnValue(throwError(() => new Error('Offline')));
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input[name="approvedPaymentMethod"]').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Unable to check online payment availability');
    availableMethods.mockReturnValue(of(['E-WALLET']));
    (fixture.componentInstance as any).loadPaymentMethods(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[value="gcash"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[value="bank-transfer"]')).toBeNull();
  });

  it('shows booking-specific Cash terms before saving a Cash payment choice', () => {
    routeParams['paymentBooking'] = '27';
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null, total: 69_000 }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('input[value="cash"]') as HTMLInputElement).click(); fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('app-payment-choice-dialog');
    expect(dialog.textContent).toContain('Cash payment terms');
    expect(dialog.textContent).toContain('34,500.00');
    expect(dialog.textContent).toContain('January 9, 2027');
    expect(dialog.querySelector('[data-testid="confirm-approved-payment"]').disabled).toBe(true);
    expect(bookingService.choosePaymentMethod).not.toHaveBeenCalled();
  });

  it.each([
    ['PHP 480 Per Head', 'Classic buffet catering tier'],
    ['PHP 580 Per Head', 'Expanded buffet catering tier'],
    ['PHP 680 Per Head', 'Full buffet catering tier'],
    ['Silver Package', 'Silver Package'],
  ])('presents the event, date and readable package name for %s in the payment summary', (name, title) => {
    routeParams['paymentBooking'] = '27';
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null,
      package: { ...editableBooking.package, packageName: name } }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('[aria-label="Booking details"]');
    expect(summary).not.toBeNull();
    expect(summary.querySelector('h3').textContent).toContain('Wedding Event');
    expect(summary.querySelector('time').getAttribute('datetime')).toBe('2027-01-12');
    expect(summary.querySelector('time').textContent).toContain('January 12, 2027');
    expect(summary.textContent).toContain(title);
    if (name.startsWith('PHP')) expect(summary.textContent).not.toContain(name);
    expect((fixture.componentInstance as any).approvedPaymentTotal()).toBe(69_000);
  });

  it('resumes an approved payment request at step 4 without resubmitting the booking', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    routeParams['paymentBooking'] = '27';
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null, total: 69_000 }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    expect(component.currentStep()).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Payment Method');
    expect(fixture.nativeElement.textContent).toContain('BK-EDIT');
    expect(component.approvedPaymentTotal()).toBe(69_000);
    await component.selectApprovedPayment('gcash');
    fixture.detectChanges();
    expect(bookingService.choosePaymentMethod).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-payment-choice-dialog')?.textContent).toContain('GCash');
    expect(fixture.nativeElement.querySelector('app-success-dialog')).toBeNull();
    await component.confirmApprovedPayment();
    expect(bookingService.choosePaymentMethod).toHaveBeenCalledWith('27', 'gcash');
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-success-dialog')?.textContent).toContain('Payment method submitted');
    expect(fixture.nativeElement.querySelector('app-success-dialog a')?.getAttribute('href')).toBe('/my-bookings');
    expect(bookingService.submitDraft).not.toHaveBeenCalled();
    expect(bookingService.updatePendingBooking).not.toHaveBeenCalled();
    expect(resetDraft).not.toHaveBeenCalled();
  });

  it('keeps a failed payment choice on step 4 for retry', async () => {
    routeParams['paymentBooking'] = '27';
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null }));
    bookingService.choosePaymentMethod.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { message: 'Payment method can no longer be changed.' } }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    await component.selectApprovedPayment('cash');
    await component.confirmApprovedPayment();
    fixture.detectChanges();
    expect(component.currentStep()).toBe(4);
    expect(component.isSubmitting()).toBe(false);
    expect(component.approvedPaymentMethod()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Payment method can no longer be changed.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels payment confirmation without saving and allows confirming the same choice once', async () => {
    routeParams['paymentBooking'] = '27';
    bookingService.loadBookingById.mockReturnValue(of({ ...editableBooking, status: 'awaiting_payment', paymentMethod: null }));
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    component.selectApprovedPayment('bank-transfer'); fixture.detectChanges();
    component.cancelApprovedPayment(); fixture.detectChanges();
    expect(bookingService.choosePaymentMethod).not.toHaveBeenCalled();
    expect(component.approvedPaymentMethod()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-payment-choice-dialog')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-success-dialog')).toBeNull();
    component.selectApprovedPayment('bank-transfer');
    await component.confirmApprovedPayment();
    await component.confirmApprovedPayment();
    expect(bookingService.choosePaymentMethod).toHaveBeenCalledExactlyOnceWith('27', 'bank-transfer');
  });

  it('does not unlock payment for a pending reservation', () => {
    routeParams['paymentBooking'] = '27';
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('not ready for payment');
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-approved-payment"]')).toBeNull();
  });

  it('locks the event type when the selected package has a specific event category', () => {
    routeParams['package'] = unboundedPackage.id;
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    const eventType = fixture.nativeElement.querySelector('#eventType') as HTMLSelectElement;
    expect(eventType.value).toBe('debut');
    expect(eventType.disabled).toBe(true);
  });
  it('disables dates before the current size cutoff', () => {
    vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    draftState.set({ ...initialDraft, packageId: standardPackage.id, guestCount: 500, eventDate: '' });
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    (fixture.componentInstance as any).openCalendar();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[data-calendar-date="2026-11-09"]') as HTMLButtonElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('[data-calendar-date="2026-11-11"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it('disables full dates in the calendar before selection', () => {
    vi.setSystemTime(new Date('2026-11-05T03:00:00Z'));
    draftState.set({ ...initialDraft, packageId: standardPackage.id, guestCount: 500, eventDate: '' });
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.openCalendar();
    fixture.detectChanges();
    const fullDay = fixture.nativeElement.querySelector('[data-calendar-date="2026-11-10"]') as HTMLButtonElement;
    const openDay = fixture.nativeElement.querySelector('[data-calendar-date="2026-11-11"]') as HTMLButtonElement;
    expect(fullDay.disabled).toBe(true);
    expect(openDay.disabled).toBe(false);
  });

  it('submits the request from review without asking for a payment method', async () => {
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.currentStep.set(3);
    fixture.detectChanges();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: HTMLButtonElement) => item.textContent?.includes('Submit Booking')) as HTMLButtonElement | undefined;
    expect(button).toBeDefined();
    expect(fixture.nativeElement.textContent).not.toContain('Choose Payment Method');
    await component.confirmBooking();
    expect(bookingService.submitDraft).toHaveBeenCalledOnce();
  });

  it('restores availability after the same date is cleared and restored inside the debounce window', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.eventForm.controls.eventDate.setValue('');
    component.eventForm.controls.eventDate.setValue(initialDraft.eventDate);
    vi.advanceTimersByTime(300);
    expect(component.availabilityState().phase).toBe('ready');
    expect(component.canContinueToAddOns()).toBe(true);
  });

  it('previews an edit with its original reservation identifier', () => {
    routeParams['booking'] = editableBooking.id;
    TestBed.createComponent(BookingPageComponent);
    vi.advanceTimersByTime(300);
    expect(bookingService.checkAvailability).toHaveBeenCalledWith(editableBooking.eventDate, editableBooking.guestCount, editableBooking.id);
  });

  it('retains unsaved event edits when returning from the billing summary', () => {
    routeParams['booking'] = '27';
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.editingBookingId.set('27');
    draft.update({ venue: 'Unsaved venue from review' });
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    expect(component.editingBookingId()).toBe('27');
    expect(component.eventForm.controls.venue.value).toBe('Unsaved venue from review');
    expect(bookingService.loadBookingById).toHaveBeenCalledWith('27');
  });

  it('preserves an unsent edit when the generic booking route resumes the shared draft', () => {
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.editingBookingId.set('27');
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    expect(component.editingBookingId()).toBe('27');
    expect(resetDraft).not.toHaveBeenCalled();
  });

  it('starts a fresh intent exactly once when a new-reservation link explicitly requests it', () => {
    routeParams['new'] = '1';
    const fixture = TestBed.createComponent(BookingPageComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(resetDraft).toHaveBeenCalledOnce();
  });

  it('sends the same shared submission UUID when retrying through the booking page', async () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    bookingService.submitDraft.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    await component.confirmBooking();
    await component.confirmBooking();
    expect(bookingService.submitDraft.mock.calls.map(call => call[3])).toEqual([
      '56df1d5f-10d0-463c-8035-143b1046643b', '56df1d5f-10d0-463c-8035-143b1046643b',
    ]);
    expect(resetDraft).not.toHaveBeenCalled();
  });

  it('does not submit an edit while selected add-ons cannot be resolved from the catalog', async () => {
    routeParams['booking'] = editableBooking.id;
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.catalogSelectionError.set('Selected add-ons are unavailable.');
    await component.confirmBooking();
    expect(bookingService.updatePendingBooking).not.toHaveBeenCalled();
    expect(component.submissionError()).toContain('Selected add-ons');
  });

  for (const { guestCount, eventDate } of [
    { guestCount: 100, eventDate: '2026-11-02' },
    { guestCount: 500, eventDate: '2026-11-04' },
  ]) {
    it(`accepts a ${guestCount}-guest cash event with one deposit day before preparation before office closing`, async () => {
      vi.setSystemTime(new Date('2026-10-29T09:59:59Z'));
      draftState.set({ ...initialDraft, guestCount, packageId: standardPackage.id, eventDate });
      const fixture = TestBed.createComponent(BookingPageComponent);
      const component = fixture.componentInstance as any;
      component.currentStep.set(4);
      component.selectPayment('cash');
      fixture.detectChanges();
      expect(component.eventForm.controls.eventDate.valid).toBe(true);
      const cashTerms = fixture.nativeElement.querySelector('.cash-payment-note') as HTMLElement;
      expect(cashTerms.querySelector('[role="alert"]')).toBeNull();
      expect(cashTerms.textContent).toContain('October 30, 2026');
      expect(cashTerms.textContent).toContain('6:00 PM');
      await component.confirmBooking();
      expect(component.bookingReference()).toBe('BK-TEST');
    });
  }

  it('blocks cash inside its preparation cutoff and preserves all selections', async () => {
    vi.setSystemTime(new Date('2026-10-29T04:00:00Z'));
    draftState.set({ ...initialDraft, guestCount: 500, packageId: standardPackage.id, eventDate: '2026-11-02' });
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.currentStep.set(4);
    component.selectPayment('cash');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('too soon for cash payment');
    await component.confirmBooking();
    expect(bookingService.submitDraft).not.toHaveBeenCalled();
    expect(draftState().eventDate).toBe('2026-11-02');
    expect(draftState().paymentMethod).toBe('cash');
    component.selectPayment('gcash');
    expect(component.eventForm.controls.eventDate.valid).toBe(false);
  });

  function chairQuantityFixture() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideProvider(BookingDraftService, { useFactory: () => new BookingDraftService(), deps: [] });
    const draft = TestBed.inject(BookingDraftService);
    draft.update(initialDraft);
    const fixture = TestBed.createComponent(BookingPageComponent);
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/add-ons`).flush({ success: true, data: [
      { id: 'chair', name: 'Tiffany Chair', price: 100, description: 'Chair rental' },
      { id: 'lechon', name: 'Lechon (35-40 kg Live Weight)', price: 14000 },
    ] });
    draft.toggleAddOn('chair');
    draft.toggleAddOn('lechon');
    (fixture.componentInstance as any).currentStep.set(2);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/auth/me`)
      .flush({ success: false }, { status: 401, statusText: 'Unauthorized' });
    return { fixture, draft, component: fixture.componentInstance as any };
  }

  it('lets customers type or paste bulk Tiffany Chair quantities while keeping the other controls unchanged', () => {
    const { fixture, draft, component } = chairQuantityFixture();
    const input = fixture.nativeElement.querySelector('input[aria-label="Tiffany Chair quantity"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = '500';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(draft.addOnQuantity('chair')).toBe(500);
    expect(draft.pricing().addOnTotal).toBe(64000);
    expect(draft.selectedAddOns().find(item => item.id === 'chair')?.price).toBe(50000);
    component.changeAddOnQuantity('chair', -1);
    fixture.detectChanges();
    expect(input.value).toBe('499');
    component.changeAddOnQuantity('chair', 1);
    fixture.detectChanges();
    expect(input.value).toBe('500');
    expect(fixture.nativeElement.querySelector('input[aria-label="Lechon (35-40 kg Live Weight) quantity"]')).toBeNull();
    expect(draft.addOnQuantity('lechon')).toBe(1);
    draft.toggleAddOn('chair');
    draft.toggleAddOn('chair');
    component.currentStep.set(3); fixture.detectChanges();
    component.currentStep.set(2); fixture.detectChanges();
    expect(draft.addOnQuantity('chair')).toBe(500);
    expect(fixture.nativeElement.querySelector('input[aria-label="Tiffany Chair quantity"]').value).toBe('500');
    TestBed.inject(HttpTestingController).verify();
  });

  it('never commits an empty, fractional, nonpositive, exponential, or excessive chair quantity', () => {
    const { fixture, draft } = chairQuantityFixture();
    const input = fixture.nativeElement.querySelector('input[aria-label="Tiffany Chair quantity"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = '45'; input.dispatchEvent(new Event('input', { bubbles: true }));
    for (const value of ['', '0', '-1', '1.5', '1e3', '99999999999999999999']) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(draft.addOnQuantity('chair'), value).toBe(45);
      input.dispatchEvent(new Event('blur'));
      expect(input.value).toBe('45');
      expect(input.getAttribute('aria-invalid')).toBe('false');
    }
    expect(draft.pricing().addOnTotal).toBe(18500);
    TestBed.inject(HttpTestingController).verify();
  });

  it('shows the guest maximum immediately, preserves the entered number, and clears the warning when corrected', () => {
    draftState.set({ ...initialDraft, packageId: standardPackage.id, guestCount: 1500 });
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#guestCount') as HTMLInputElement;
    input.value = '1501'; input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.eventForm.controls.guestCount.value).toBe(1501);
    expect(input.value).toBe('1501');
    expect(fixture.nativeElement.querySelector('#guest-count-error')?.textContent).toContain('Maximum of 1,500 guests only.');
    expect(input.classList.contains('guest-count-invalid')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    component.continueToAddOns();
    expect(component.currentStep()).toBe(1);
    input.value = '1500'; input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(300); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#guest-count-error')).toBeNull();
    expect(input.classList.contains('guest-count-invalid')).toBe(false);
    component.continueToAddOns();
    expect(component.currentStep()).toBe(2);
  });

  it('accepts only whole guest counts from 1 through 1500 and blocks invalid counts on Continue', () => {
    draftState.set({ ...initialDraft, packageId: standardPackage.id });
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    for (const value of [1, 1500]) {
      component.eventForm.controls.guestCount.setValue(value);
      expect(component.eventForm.controls.guestCount.valid).toBe(true);
    }
    for (const value of [0, -1, 1.5, 1501, 10000]) {
      component.eventForm.controls.guestCount.setValue(value);
      component.continueToAddOns();
      expect(component.eventForm.controls.guestCount.invalid).toBe(true);
      expect(component.eventForm.controls.guestCount.value).toBe(value);
      expect(component.currentStep()).toBe(1);
      expect(component.canContinueToAddOns()).toBe(false);
    }
  });

  it('enforces four calendar days for all new bookings and pending edits', () => {
    routeParams['booking'] = editableBooking.id;
    vi.setSystemTime(new Date('2026-10-29T04:00:00Z'));
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    for (const date of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
      component.eventForm.controls.eventDate.setValue(date);
      fixture.detectChanges();
      expect(component.dateUnavailable()).toBe(true);
      const feedback = fixture.nativeElement.querySelector('#availability-feedback');
      expect(feedback.textContent).toContain('Unavailable Date. Please select a date at least 4 days in advance.');
      expect(feedback.textContent).not.toContain('Choose a future date');
      component.continueToAddOns();
      expect(component.currentStep()).toBe(1);
      expect(component.canContinueToAddOns()).toBe(false);
      expect(fixture.nativeElement.querySelector('form button[type="submit"]').disabled).toBe(true);
    }
    component.eventForm.controls.eventDate.setValue('2026-11-02');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(component.dateUnavailable()).toBe(false);
    expect(fixture.nativeElement.querySelector('#availability-feedback').textContent).not.toContain('Unavailable Date.');
    component.continueToAddOns();
    expect(component.currentStep()).toBe(2);
  });

  it('revalidates on every Continue click at the 11 PM Philippine calendar rollover', () => {
    routeParams['booking'] = editableBooking.id;
    const draft = TestBed.inject(BookingDraftService);
    draft.editingBookingId.set(editableBooking.id);
    vi.setSystemTime(new Date('2026-10-29T14:59:59Z'));
    draftState.set({ ...initialDraft, eventDate: '2026-11-02' });
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.continueToAddOns();
    expect(component.currentStep()).toBe(2);
    component.goToStep(1);
    vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));
    component.continueToAddOns();
    expect(component.currentStep()).toBe(1);
    expect(component.dateUnavailable()).toBe(true);
    expect(component.eventForm.controls.eventDate.invalid).toBe(true);
  });

  it('does not let the progress indicator unlock steps before Continue validates event details', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.navigateFromStepper(4);
    expect(component.currentStep()).toBe(1);
    expect(component.furthestStep()).toBe(1);
  });

  it('revisits unlocked steps without losing event or add-on data', () => {
    draftState.set({ ...initialDraft, selectedAddOnIds: ['5'] });
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.continueToAddOns();
    component.goToStep(3);
    const saved = draftState();
    component.navigateFromStepper(1);
    component.navigateFromStepper(3);
    expect(component.currentStep()).toBe(3);
    expect(draftState()).toEqual(saved);
  });

  it('requires event details to be validated again after editing an earlier step', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.continueToAddOns();
    component.goToStep(3);
    component.goToStep(4);
    component.navigateFromStepper(1);
    component.eventForm.controls.venue.setValue('');
    component.navigateFromStepper(4);
    expect(component.currentStep()).toBe(1);
    expect(component.furthestStep()).toBe(1);
    component.eventForm.controls.venue.setValue('New venue');
    component.continueToAddOns();
    expect(component.currentStep()).toBe(2);
    expect(component.furthestStep()).toBe(2);
    expect(draftState().venue).toBe('New venue');
    expect(draftState().paymentMethod).toBe('gcash');
  });

  it('ignores the active step and blocks progress navigation during submission', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.continueToAddOns();
    component.goToStep(3);
    component.goToStep(4);
    component.navigateFromStepper(4);
    expect(component.currentStep()).toBe(4);
    component.isSubmitting.set(true);
    component.navigateFromStepper(1);
    expect(component.currentStep()).toBe(4);
  });

  it('does not unlock Payment from a query parameter on a fresh booking flow', () => {
    routeParams['step'] = '4';
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    expect(component.currentStep()).toBe(1);
    expect(component.furthestStep()).toBe(1);
  });

  it('requires review again after changing add-ons before returning to Payment', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);
    component.continueToAddOns();
    component.goToStep(3);
    component.goToStep(4);
    component.navigateFromStepper(2);
    component.toggleAddOn('5');
    component.navigateFromStepper(4);
    expect(component.currentStep()).toBe(2);
    expect(component.furthestStep()).toBe(3);
    component.navigateFromStepper(3);
    component.goToStep(4);
    expect(component.currentStep()).toBe(4);
  });

  it('shows the approved half-deposit requirement and only supported manual payment methods', () => {
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.currentStep.set(4);
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Down Payment (50%)');
    expect(component.paymentMethods.map((method: { label: string }) => method.label)).toEqual([
      'Cash', 'Bank Transfer', 'GCash'
    ]);
    expect(content).not.toMatch(/credit|debit card/i);
  });

  it('aligns the event type when a specialized package is selected from the packages page', () => {
    routeParams['package'] = unboundedPackage.id;

    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    expect(component.eventForm.controls.packageId.value).toBe(unboundedPackage.id);
    expect(component.eventForm.controls.eventType.value).toBe('debut');
    expect(draftState().eventType).toBe('debut');
  });

  it('prefills package-specific event type and included guests when chosen inside the booking form', () => {
    draftState.set({ ...initialDraft, eventType: null, packageId: null, guestCount: 1 });
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    component.eventForm.controls.guestCount.setValue(null);
    component.eventForm.controls.packageId.setValue(unboundedPackage.id);
    expect(component.eventForm.controls.eventType.value).toBe('debut');
    expect(component.eventForm.controls.guestCount.value).toBe(50);
    expect(draftState().packageId).toBe(unboundedPackage.id);
    expect(draftState().guestCount).toBe(50);
    component.eventForm.controls.guestCount.setValue(75);
    component.eventForm.controls.guestCount.markAsDirty();
    component.eventForm.controls.packageId.setValue(standardPackage.id);
    component.eventForm.controls.packageId.setValue(unboundedPackage.id);
    expect(component.eventForm.controls.guestCount.value).toBe(75);
  });

  it('uses each fixed package included guest count instead of hardcoding the Amethyst default', () => {
    draftState.set({ ...initialDraft, eventType: null, packageId: null, guestCount: 1 });
    const catalog = TestBed.inject(PackageService) as any;
    const diamond = { ...unboundedPackage, id: '21', name: 'Diamond Package', includedGuests: 100 };
    const ruby = { ...unboundedPackage, id: '22', name: 'Ruby Package', includedGuests: 120 };
    catalog.packages.set([pkg, unboundedPackage, diamond, ruby, standardPackage]);
    catalog.getPackageById = (id: string) => catalog.packages().find((item: CateringPackage) => item.id === id);
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    component.eventForm.controls.guestCount.setValue(null);
    component.eventForm.controls.guestCount.markAsDirty();
    for (const [id, included] of [[unboundedPackage.id, 50], [diamond.id, 100], [ruby.id, 120]]) {
      component.eventForm.controls.packageId.setValue(id);
      expect(component.eventForm.controls.guestCount.value).toBe(included);
      expect(draftState().guestCount).toBe(included);
    }
  });

  it('preserves the actual guest count when opening an existing fixed-package reservation for editing', () => {
    routeParams['booking'] = editableBooking.id;
    bookingService.loadBookingById.mockReturnValueOnce(of({ ...editableBooking, eventType: 'debut', guestCount: 1,
      package: { ...unboundedPackage, packageId: unboundedPackage.id, packageName: unboundedPackage.name, packageTotal: 85888 },
    }));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    expect(component.eventForm.controls.packageId.value).toBe(unboundedPackage.id);
    expect(component.eventForm.controls.eventType.value).toBe('debut');
    expect(component.eventForm.controls.guestCount.value).toBe(1);
    expect(draftState().guestCount).toBe(1);
  });

  it('fills a linked package after the catalog loads while preserving a manually entered guest estimate', () => {
    routeParams['package'] = unboundedPackage.id;
    draftState.set({ ...initialDraft, eventType: null, packageId: null, guestCount: 1 });
    const catalog = TestBed.inject(PackageService) as any;
    catalog.packages.set([]);
    catalog.getPackageById = (id: string) => catalog.packages().find((item: CateringPackage) => item.id === id);
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.eventForm.controls.guestCount.setValue(75);
    component.eventForm.controls.guestCount.markAsDirty();
    catalog.packages.set([pkg, unboundedPackage, standardPackage]);
    fixture.detectChanges();
    expect(component.eventForm.controls.eventType.value).toBe('debut');
    expect(component.eventForm.controls.guestCount.value).toBe(75);
  });

  it('does not restore the original linked package after the customer chooses another package while loading', () => {
    routeParams['package'] = unboundedPackage.id;
    draftState.set({ ...initialDraft, eventType: null, packageId: null, guestCount: 1 });
    const catalog = TestBed.inject(PackageService) as any;
    catalog.packages.set([]);
    catalog.getPackageById = (id: string) => catalog.packages().find((item: CateringPackage) => item.id === id);
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.eventForm.controls.packageId.setValue(pkg.id);
    catalog.packages.set([pkg, unboundedPackage, standardPackage]);
    fixture.detectChanges();
    expect(component.eventForm.controls.packageId.value).toBe(pkg.id);
    expect(component.eventForm.controls.eventType.value).toBe('wedding');
    expect(component.eventForm.controls.guestCount.value).toBe(1); // Per-head pricing needs the customer's estimate.
  });

  it('only offers specialized packages matching the occasion while keeping standard catering available', () => {
    draftState.set({ ...initialDraft, packageId: null });
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.eventForm.controls.eventType.setValue('wedding');
    fixture.detectChanges();

    const packageSelect = fixture.nativeElement.querySelector('#packageId') as HTMLSelectElement;
    const options = Array.from(packageSelect.options, option => option.textContent?.trim());
    expect(options.some(option => option?.startsWith(pkg.name))).toBe(true);
    expect(options.some(option => option === '₱580 Per Head')).toBe(true);
    expect(options.some(option => option?.startsWith(unboundedPackage.name))).toBe(false);
  });

  it('returns a stale mismatched draft to event details before submission', async () => {
    draftState.set({ ...initialDraft, packageId: unboundedPackage.id });
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.draftService.selectedPackage = computed(() => unboundedPackage);
    component.currentStep.set(4);
    vi.advanceTimersByTime(300);
    draftState.update(value => ({ ...value, eventType: 'wedding' }));
    component.eventForm.controls.eventType.setValue('wedding');

    await component.confirmBooking();

    expect(bookingService.submitDraft).not.toHaveBeenCalled();
    expect(component.currentStep()).toBe(1);
    expect(component.submissionError()).toBe('Choose a package that matches the selected event type.');
    expect(component.eventForm.controls.packageId.hasError('packageEvent')).toBe(true);
  });

  it('keeps the customer on event details when guests exceed the selected package range', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    component.eventForm.setValue({
      eventType: 'wedding', eventDate: '2027-01-10', eventTime: '2:00 PM', venue: 'Venue',
      guestCount: 1000, packageId: pkg.id, specialRequest: '',
    });

    component.continueToAddOns();

    expect(component.currentStep()).toBe(1);
    expect(component.eventForm.controls.guestCount.errors?.packageRange).toBe(true);
  });

  it('accepts an estimated guest count when the package has no confirmed limits', () => {
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    component.eventForm.setValue({
      eventType: 'debut', eventDate: '2027-01-10', eventTime: '2:00 PM', venue: 'Venue',
      guestCount: 720, packageId: unboundedPackage.id, specialRequest: '  No shellfish.  ',
    });
    vi.advanceTimersByTime(300);

    component.continueToAddOns();

    expect(component.currentStep()).toBe(2);
    expect(draftState().guestCount).toBe(720);
    expect(draftState().specialRequest).toBe('No shellfish.');
  });

  it('labels guests as an estimate and explains base-plus-excess pricing without an invented range', () => {
    const fixture = TestBed.createComponent(BookingPageComponent);
    const component = fixture.componentInstance as any;
    component.eventForm.controls.packageId.setValue(unboundedPackage.id);
    component.eventForm.controls.guestCount.setValue(51);
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Estimated number of guests');
    expect(content).toContain('PHP 85,888 includes 50 guests');
    expect(content).toContain('PHP 650 for each additional guest');
    expect(content).not.toContain('null-null');
    expect(content).not.toContain('undefined-undefined');
  });

  it('loads a pending booking for editing and preserves its add-ons and special request', () => {
    routeParams['booking'] = editableBooking.id;

    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    expect(bookingService.loadBookingById).toHaveBeenCalledWith(editableBooking.id);
    expect(component.editingLoading()).toBe(false);
    expect(component.eventForm.getRawValue()).toEqual({
      eventType: 'wedding', eventDate: '2027-01-12', eventTime: '3:00 PM', venue: 'Updated Venue',
      guestCount: 75, packageId: pkg.id, specialRequest: 'No shellfish.',
    });
    expect(draftState().selectedAddOnIds).toEqual(['5']);
    expect(draftState().paymentMethod).toBe('gcash');
  });

  it('saves pending changes once while an update is in progress', async () => {
    routeParams['booking'] = editableBooking.id;
    let resolveUpdate!: (booking: Booking) => void;
    bookingService.updatePendingBooking.mockImplementation(() => new Promise<Booking>(resolve => { resolveUpdate = resolve; }));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;

    const first = component.confirmBooking();
    const second = component.confirmBooking();

    expect(component.isSubmitting()).toBe(true);
    expect(bookingService.updatePendingBooking).toHaveBeenCalledTimes(1);
    expect(bookingService.submitDraft).not.toHaveBeenCalled();
    resolveUpdate(editableBooking);
    await Promise.all([first, second]);
    expect(component.bookingReference()).toBe(editableBooking.reference);
    expect(resetDraft).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/dashboard'], {
      state: { bookingReference: editableBooking.reference, bookingUpdated: true },
    });
  });

  it('preserves pending edit data and shows the server reason when saving fails', async () => {
    routeParams['booking'] = editableBooking.id;
    bookingService.updatePendingBooking.mockRejectedValue(new HttpErrorResponse({
      status: 409, error: { message: 'Only pending bookings can be edited.' },
    }));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);

    await component.confirmBooking();

    expect(resetDraft).not.toHaveBeenCalled();
    expect(draftState().specialRequest).toBe('No shellfish.');
    expect(component.submissionError()).toBe('Only pending bookings can be edited.');
  });

  it('shows the backend validation reason when confirmation is rejected', async () => {
    bookingService.submitDraft.mockRejectedValue(new HttpErrorResponse({
        status: 400,
        error: { message: 'Guest count must be between 30 and 80.' },
      }));
    const component = TestBed.createComponent(BookingPageComponent).componentInstance as any;
    vi.advanceTimersByTime(300);

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
