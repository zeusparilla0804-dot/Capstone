import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, filter, finalize, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Booking, BookingAvailability, CateringPackage, EventType, PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { BookingSuccessComponent } from './components/booking-success/booking-success';
import { BookingStepperComponent } from './components/booking-stepper/booking-stepper';
import { bookingSubmissionMessage, isBookingCapacityConflict } from './booking-submission-error';
import { cashDepositDeadline, cashPreparationDays, minimumBookingEventDate } from '../../core/utils/cash-payment-policy';
import { bookingTotal } from '../../core/utils/customer-payment-status';
import { SuccessDialogComponent } from '../../shared/components/success-dialog/success-dialog';
import { PaymentChoiceDialogComponent } from './components/payment-choice-dialog/payment-choice-dialog';
import { PaymentDestinationService } from '../../core/services/payment-destination.service';

type BookingStep = 1 | 2 | 3 | 4;
const STANDARD_PACKAGE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  '480': 'Classic buffet catering tier',
  '580': 'Expanded buffet catering tier',
  '680': 'Full buffet catering tier',
};
type AvailabilityQuery = Readonly<{ date: string; guestCount: number; key: string }>;
type AvailabilityState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'checking'; key: string }>
  | Readonly<{ phase: 'ready'; key: string; data: BookingAvailability }>
  | Readonly<{ phase: 'error'; key: string; message: string }>;

@Component({
  selector: 'app-booking-page',
  imports: [BookingStepperComponent, BookingSuccessComponent, SuccessDialogComponent, PaymentChoiceDialogComponent, CurrencyPipe, DatePipe, PublicHeaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './booking.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking.page.scss',
})
export class BookingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookingService = inject(BookingService);
  private readonly paymentDestinations = inject(PaymentDestinationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryAvailabilityRequest = new Subject<void>();
  private readonly currentAvailabilityQuery = signal<AvailabilityQuery | null>(null);
  private readonly availabilityFeedback = viewChild<ElementRef<HTMLElement>>('availabilityFeedback');
  private pendingPackageDefaults: { id: string; alignEventType: boolean } | null = null;
  private defaultGuestCount: number | null = null;
  protected readonly draftService = inject(BookingDraftService);
  protected readonly packageService = inject(PackageService);

  protected readonly currentStep = signal<BookingStep>(1);
  protected readonly furthestStep = this.draftService.unlockedStep;
  protected readonly editingBookingId = signal<string | null>(null);
  protected readonly editingLoading = signal(false);
  protected readonly editingError = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly submissionError = signal('');
  protected readonly availabilityConflictMessage = signal('');
  protected readonly availabilityState = signal<AvailabilityState>({ phase: 'idle' });
  protected readonly dateUnavailable = signal(false);
  protected readonly calendarOpen = signal(false);
  protected readonly calendarMonth = signal(this.minDate.slice(0, 7));
  protected readonly calendarLoading = signal(false);
  protected readonly calendarError = signal('');
  protected readonly calendarAvailability = signal<Readonly<Record<string, BookingAvailability['status']>>>({});
  private calendarRequestKey = '';
  private calendarLoadedGuestCount = 0;
  protected readonly calendarDays = computed(() => {
    const month = this.calendarMonth();
    const [year, monthNumber] = month.split('-').map(Number);
    const offset = new Date(Date.UTC(year!, monthNumber! - 1, 1)).getUTCDay();
    const count = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
    const statuses = this.calendarAvailability();
    const ready = !this.calendarLoading() && !this.calendarError();
    const minimum = this.minimumBookingDate;
    return Array.from({ length: offset + count }, (_, index) => {
      if (index < offset) return { date: '', day: 0, disabled: true, status: '' };
      const day = index - offset + 1;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      return { date, day, disabled: !ready || date < minimum || !statuses[date] || statuses[date] === 'FULL',
        status: statuses[date] ?? '' };
    });
  });
  protected readonly canContinueToAddOns = computed(() => {
    const query = this.currentAvailabilityQuery();
    const state = this.availabilityState();
    return !this.dateUnavailable() && query !== null
      && state.phase === 'ready'
      && state.key === query.key
      && state.data.status !== 'FULL';
  });
  protected readonly bookingReference = signal('');
  protected readonly paymentBookingId = this.route.snapshot.queryParamMap.get('paymentBooking');
  protected readonly approvedPaymentBooking = signal<Booking | null>(null);
  protected readonly approvedPackageDisplayName = computed(() => {
    const name = this.approvedPaymentBooking()?.package.packageName ?? '';
    const standard = /^PHP\s*(480|580|680)\s*Per\s*Head$/i.exec(name.trim());
    return standard ? STANDARD_PACKAGE_DISPLAY_NAMES[standard[1]!] ?? name : name;
  });
  protected readonly approvedPaymentMethod = signal<PaymentMethod | null>(null);
  protected readonly paymentMethodSubmitted = signal(false);
  protected readonly paymentChoiceConfirmation = signal(false);
  private readonly availableOnlineMethods = signal<readonly string[]>([]);
  protected readonly paymentMethodsLoading = signal(false);
  protected readonly paymentMethodsError = signal('');
  protected readonly availablePaymentMethods = computed(() => this.paymentMethods.filter(method =>
    method.value === 'cash' || this.availableOnlineMethods().includes(method.value === 'gcash' ? 'E-WALLET' : 'BANK_TRANSFER'),
  ));
  protected readonly approvedPaymentMethodLabel = computed(() => this.paymentMethods.find(method => method.value === this.approvedPaymentMethod())?.label ?? '');
  protected readonly approvedPaymentTotal = computed(() => {
    const booking = this.approvedPaymentBooking();
    return booking ? bookingTotal(booking) : 0;
  });
  protected readonly approvedPaymentBalance = computed(() => Math.max(
    this.approvedPaymentTotal() - (this.approvedPaymentBooking()?.amountPaid ?? 0), 0,
  ));
  protected readonly approvedPaymentDeposit = computed(() => Math.max(
    Math.round(this.approvedPaymentTotal() * 50) / 100 - (this.approvedPaymentBooking()?.amountPaid ?? 0), 0,
  ));
  protected readonly approvedCashDeadline = computed(() => {
    const booking = this.approvedPaymentBooking();
    return booking && this.approvedPaymentMethod() === 'cash'
      ? cashDepositDeadline(booking.eventDate, booking.guestCount) : null;
  });
  protected get minDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  protected get minimumBookingDate(): string {
    return minimumBookingEventDate(this.eventForm?.controls.guestCount.value ?? this.draftService.draft().guestCount);
  }
  protected get dateValidationMessage(): string {
    return this.draftService.draft().paymentMethod === 'cash'
      ? `This event date is too soon for cash payment. Choose ${formatDate(this.minimumBookingDate + 'T00:00:00Z', 'MMMM d, y', 'en-US', 'UTC')} or later so the 50% deposit can be paid by 6:00 PM Philippine Time before preparation begins.`
      : `Unavailable Date. Please select a date at least ${cashPreparationDays(this.eventForm?.controls.guestCount.value ?? this.draftService.draft().guestCount) + 1} days in advance.`;
  }
  protected get selectedCashDeadline() {
    const draft = this.draftService.draft();
    return draft.paymentMethod === 'cash' ? cashDepositDeadline(draft.eventDate, draft.guestCount) : null;
  }
  protected get cashPaymentDateError(): string {
    const draft = this.draftService.draft();
    return draft.paymentMethod === 'cash' && !this.isEventDateAvailable(draft.eventDate) ? this.dateValidationMessage : '';
  }
  protected readonly eventTypes: readonly { value: EventType; label: string }[] = [
    { value: 'wedding', label: 'Wedding' }, { value: 'birthday', label: 'Birthday' },
    { value: 'corporate', label: 'Corporate Event' }, { value: 'debut', label: 'Debut' },
    { value: 'anniversary', label: 'Anniversary' }, { value: 'other', label: 'Other' },
  ];
  protected readonly eventTimes = ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'];
  protected readonly paymentMethods: readonly { value: PaymentMethod; label: string; description: string }[] = [
    { value: 'cash', label: 'Cash', description: 'Pay in person at the LA Chef office after approval. Staff will record the cash received; no online payment proof is required.' },
    { value: 'bank-transfer', label: 'Bank Transfer', description: 'Transfer details will be provided after approval.' },
    { value: 'gcash', label: 'GCash', description: 'Payment instructions will follow after approval.' },
  ];

  protected readonly eventForm = new FormGroup({
    eventType: new FormControl<EventType | ''>('', { nonNullable: true, validators: Validators.required }),
    eventDate: new FormControl('', { nonNullable: true, validators: [Validators.required, this.futureDateValidator.bind(this)] }),
    eventTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    guestCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(1500), control => control.value !== null && !Number.isSafeInteger(control.value) ? { wholeGuests: true } : null] }),
    packageId: new FormControl('', { nonNullable: true, validators: [Validators.required, (control): ValidationErrors | null => {
      const pkg = this.packageService.getPackageById(control.value);
      const eventType: EventType | '' | undefined = this.eventForm?.controls.eventType.value;
      return pkg && eventType && !this.packageMatchesEvent(pkg, eventType) ? { packageEvent: true } : null;
    }] }),
    specialRequest: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
  });

  constructor() {
    if (this.paymentBookingId) {
      this.currentStep.set(4);
      this.loadPaymentMethods();
      this.editingLoading.set(true);
      this.bookingService.loadBookingById(this.paymentBookingId).pipe(
        finalize(() => this.editingLoading.set(false)), takeUntilDestroyed(this.destroyRef),
      ).subscribe({
        next: booking => {
          if (booking.status !== 'awaiting_payment' || booking.amountPaid > 0 || booking.latestProofStatus) {
            this.editingError.set('This reservation is not ready for payment selection. Open My Reservations for its current payment status.');
            return;
          }
          this.approvedPaymentBooking.set(booking);
          // A method saved before leaving this page can be reviewed again without a new booking.
          this.approvedPaymentMethod.set(booking.paymentMethod ?? null);
        },
        error: error => this.editingError.set(bookingSubmissionMessage(error)),
      });
      return;
    }
    const explicitBooking = this.route.snapshot.queryParamMap.get('booking');
    if (!explicitBooking && this.route.snapshot.queryParamMap.get('new') === '1') this.draftService.reset();
    const savedEditingId = this.draftService.editingBookingId();
    const requestedBooking = explicitBooking ?? savedEditingId;
    this.packageService.load();
    this.draftService.loadAddOns();
    const existing = this.draftService.draft();
    const requestedPackage = this.route.snapshot.queryParamMap.get('package');
    this.editingBookingId.set(requestedBooking);
    if (requestedPackage) this.draftService.selectPackage(requestedPackage);
    const draft = this.draftService.draft();
    this.eventForm.setValue({
      eventType: draft.eventType ?? existing.eventType ?? '', eventDate: draft.eventDate,
      eventTime: draft.eventTime, venue: draft.venue, guestCount: draft.guestCount,
      packageId: draft.packageId ?? '', specialRequest: draft.specialRequest ?? '',
    });
    this.eventForm.controls.packageId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(packageId => {
      this.draftService.selectPackage(packageId || null);
      if (!packageId) this.eventForm.controls.eventType.enable({ emitEvent: false });
      if (!this.editingLoading()) this.applyPackageDefaults(packageId, true);
    });
    if (!requestedBooking) this.applyPackageDefaults(draft.packageId ?? '', !!requestedPackage);
    effect(() => {
      this.packageService.packages();
      const pending = this.pendingPackageDefaults;
      if (pending && !this.editingLoading()) this.applyPackageDefaults(pending.id, pending.alignEventType);
    });
    const requestedStep = Number(this.route.snapshot.queryParamMap.get('step'));
    if (draft.packageId && requestedStep >= 2 && requestedStep <= 3 && requestedStep <= this.furthestStep()) {
      this.currentStep.set(requestedStep as BookingStep);
    }
    this.watchAvailability();
    this.eventForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.furthestStep.set(1);
      this.currentStep.set(1);
    });
    if (requestedBooking) this.loadPendingBooking(requestedBooking, requestedBooking === savedEditingId && !!draft.packageId);
  }

  protected continueToAddOns(): void {
    this.revalidateDate();
    this.eventForm.controls.guestCount.updateValueAndValidity({ emitEvent: false });
    const value = this.eventForm.getRawValue();
    const selectedPackage = this.packageService.getPackageById(value.packageId);
    const guestControl = this.eventForm.controls.guestCount;
    const packageControl = this.eventForm.controls.packageId;
    if (guestControl.errors?.['packageRange']) {
      const { packageRange: _packageRange, ...remainingErrors } = guestControl.errors;
      guestControl.setErrors(Object.keys(remainingErrors).length ? remainingErrors : null);
    }
    if (selectedPackage && (
      (selectedPackage.minGuests !== null && value.guestCount < selectedPackage.minGuests) ||
      (selectedPackage.maxGuests !== null && value.guestCount > selectedPackage.maxGuests)
    )) {
      guestControl.setErrors({ ...guestControl.errors, packageRange: true });
    }
    if (packageControl.errors?.['packageEvent']) {
      const { packageEvent: _packageEvent, ...remainingErrors } = packageControl.errors;
      packageControl.setErrors(Object.keys(remainingErrors).length ? remainingErrors : null);
    }
    if (selectedPackage && !this.packageMatchesEvent(selectedPackage, value.eventType)) {
      packageControl.setErrors({ ...packageControl.errors, packageEvent: true });
    }
    if (!selectedPackage || this.eventForm.invalid || !this.canContinueToAddOns()) {
      this.furthestStep.set(1);
      this.eventForm.markAllAsTouched();
      return;
    }
    this.draftService.update({
      ...value,
      eventType: value.eventType as EventType,
      packageId: value.packageId,
      specialRequest: value.specialRequest.trim() || undefined,
    });
    this.currentStep.set(2);
    this.furthestStep.update(step => Math.max(step, 2) as BookingStep);
  }

  protected goToStep(step: BookingStep): void {
    if (this.isSubmitting() || this.editingLoading() || this.editingError() || step === this.currentStep()) return;
    if (step < this.currentStep()) { this.currentStep.set(step); return; }
    if (step >= 3 && this.draftService.catalogSelectionError()) return;
    if (step > this.currentStep() + 1 && step > this.furthestStep()) return;
    if (!this.revalidateDate()) {
      this.currentStep.set(1);
      this.furthestStep.set(1);
      return;
    }
    if (this.currentStep() === 1) {
      this.continueToAddOns();
      if (this.currentStep() !== 2) return;
    }
    if (this.eventForm.invalid || !this.canContinueToAddOns()) {
      this.furthestStep.set(1);
      this.currentStep.set(1);
      return;
    }
    this.currentStep.set(step);
    this.furthestStep.update(unlocked => Math.max(unlocked, step) as BookingStep);
  }

  protected navigateFromStepper(step: number): void {
    if (!Number.isInteger(step) || step < 1 || step > 3 || step > this.furthestStep()) return;
    this.goToStep(step as BookingStep);
  }

  protected photoboothOptions() {
    return this.draftService.availableAddOns().filter(item => /photobooth/i.test(item.name));
  }

  protected otherAddOns() {
    return this.draftService.availableAddOns().filter(item => !/photobooth/i.test(item.name));
  }

  protected selectedPhotoboothId(): string {
    return this.photoboothOptions().find(item => this.isAddOnSelected(item.id))?.id ?? '';
  }

  protected photoboothPrice(): number {
    const selected = this.photoboothOptions().find(item => item.id === this.selectedPhotoboothId());
    return selected?.price ?? Math.min(...this.photoboothOptions().map(item => item.price));
  }

  protected togglePhotobooth(event: Event): void {
    if ((event.target as HTMLInputElement).checked) {
      const first = this.photoboothOptions()[0];
      if (first && !this.selectedPhotoboothId()) this.toggleAddOn(first.id);
    } else {
      for (const option of this.photoboothOptions()) {
        if (this.isAddOnSelected(option.id)) this.toggleAddOn(option.id);
      }
    }
  }

  protected choosePhotobooth(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    for (const option of this.photoboothOptions()) {
      if (option.id !== id && this.isAddOnSelected(option.id)) this.draftService.toggleAddOn(option.id);
    }
    if (id && !this.isAddOnSelected(id)) this.draftService.toggleAddOn(id);
  }

  protected isCoffeeBar(name: string): boolean { return /^Coffee Bar for (50|100) Guests$/i.test(name); }

  protected coffeeInclusions(name: string): string {
    return /for 100 Guests$/i.test(name)
      ? 'Includes coffee service, cookies, and light snacks for 100 guests.'
      : 'Includes coffee service and cookies for 50 guests.';
  }

  protected toggleAddOn(addOnId: string): void {
    this.draftService.toggleAddOn(addOnId);
    this.furthestStep.update(step => Math.min(step, 3) as BookingStep);
  }
  protected changeAddOnQuantity(addOnId: string, delta: number): void {
    this.draftService.setAddOnQuantity(addOnId, this.draftService.addOnQuantity(addOnId) + delta);
    this.furthestStep.update(step => Math.min(step, 3) as BookingStep);
  }
  protected editAddOnQuantity(addOnId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const addOn = this.draftService.addOns().find(item => item.id === addOnId);
    if (!addOn || addOn.name.trim().toLowerCase() !== 'tiffany chair' || !this.isAddOnSelected(addOnId)) return;
    const quantity = Number(input.value);
    const valid = /^[0-9]+$/.test(input.value) && Number.isSafeInteger(quantity)
      && quantity >= 1 && quantity <= this.draftService.maxAddOnQuantity(addOn);
    input.setCustomValidity(valid ? '' : 'Enter a whole quantity of at least 1 within the allowed limit.');
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) return;
    this.draftService.setAddOnQuantity(addOnId, quantity);
    this.furthestStep.update(step => Math.min(step, 3) as BookingStep);
  }
  protected finishAddOnQuantityEdit(addOnId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = String(this.draftService.addOnQuantity(addOnId));
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
  }
  protected retryAvailability(): void {
    if (this.currentAvailabilityQuery()) this.retryAvailabilityRequest.next();
  }
  protected openCalendar(): void {
    if (this.calendarOpen()) { this.calendarOpen.set(false); return; }
    const selected = this.eventForm.controls.eventDate.value;
    this.calendarMonth.set(selected && selected >= this.minimumBookingDate
      ? selected.slice(0, 7) : this.minimumBookingDate.slice(0, 7));
    this.calendarOpen.set(true);
    this.loadCalendarMonth();
  }
  protected moveCalendarMonth(delta: number): void {
    const [year, month] = this.calendarMonth().split('-').map(Number);
    const shifted = new Date(Date.UTC(year!, month! - 1 + delta, 1)).toISOString().slice(0, 7);
    if (shifted < this.minimumBookingDate.slice(0, 7) || shifted > '2100-12') return;
    this.calendarMonth.set(shifted);
    this.loadCalendarMonth();
  }
  protected retryCalendar(): void { this.loadCalendarMonth(); }
  protected chooseCalendarDate(date: string): void {
    if (!date || !this.calendarOpen() || date < this.minimumBookingDate
      || !this.calendarAvailability()[date] || this.calendarAvailability()[date] === 'FULL') return;
    this.eventForm.controls.eventDate.setValue(date);
    this.calendarOpen.set(false);
  }
  private loadCalendarMonth(): void {
    const guestCount = this.eventForm.controls.guestCount.value;
    if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 1500) {
      this.calendarError.set('Enter a valid guest count before choosing a date.');
      return;
    }
    const month = this.calendarMonth();
    const key = `${month}:${guestCount}:${this.editingBookingId() ?? ''}`;
    this.calendarLoadedGuestCount = guestCount;
    this.calendarRequestKey = key;
    this.calendarLoading.set(true);
    this.calendarError.set('');
    this.calendarAvailability.set({});
    this.bookingService.checkMonthAvailability(month, guestCount, this.editingBookingId() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: days => {
          if (this.calendarRequestKey !== key) return;
          this.calendarAvailability.set(Object.fromEntries(days.map(day => [day.date, day.status])));
          this.calendarLoading.set(false);
        },
        error: () => {
          if (this.calendarRequestKey !== key) return;
          this.calendarError.set('Unable to load calendar availability. Try again.');
          this.calendarLoading.set(false);
        },
      });
  }
  protected isAddOnSelected(addOnId: string): boolean { return this.draftService.draft().selectedAddOnIds.includes(addOnId); }
  protected selectPayment(method: PaymentMethod): void {
    this.draftService.update({ paymentMethod: method });
    this.revalidateDate();
  }
  protected selectApprovedPayment(method: PaymentMethod): void {
    const booking = this.approvedPaymentBooking();
    if (!booking || this.isSubmitting() || this.paymentMethodSubmitted() || booking.status !== 'awaiting_payment'
      || !this.availablePaymentMethods().some(choice => choice.value === method)) return;
    this.approvedPaymentMethod.set(method);
    this.submissionError.set('');
    this.paymentChoiceConfirmation.set(true);
  }

  protected cancelApprovedPayment(): void {
    if (this.isSubmitting()) return;
    this.paymentChoiceConfirmation.set(false);
    this.approvedPaymentMethod.set(this.approvedPaymentBooking()?.paymentMethod ?? null);
  }

  protected async confirmApprovedPayment(): Promise<void> {
    const booking = this.approvedPaymentBooking();
    const method = this.approvedPaymentMethod();
    if (!this.paymentChoiceConfirmation() || !booking || !method || this.isSubmitting() || this.paymentMethodSubmitted() || booking.status !== 'awaiting_payment'
      || !this.availablePaymentMethods().some(choice => choice.value === method)) return;
    this.paymentChoiceConfirmation.set(false);
    this.isSubmitting.set(true);
    this.submissionError.set('');
    try {
      await this.bookingService.choosePaymentMethod(booking.id, method);
      this.paymentMethodSubmitted.set(true);
    } catch (error) {
      this.approvedPaymentMethod.set(null);
      this.submissionError.set(bookingSubmissionMessage(error));
      this.loadPaymentMethods();
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected closePaymentConfirmation(): void {
    void this.router.navigate(['/my-bookings']);
  }

  protected loadPaymentMethods(): void {
    if (this.paymentMethodsLoading()) return;
    this.paymentMethodsLoading.set(true);
    this.paymentMethodsError.set('');
    this.availableOnlineMethods.set([]);
    this.paymentDestinations.availableMethods().pipe(
      finalize(() => this.paymentMethodsLoading.set(false)), takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: methods => this.availableOnlineMethods.set(methods),
      error: () => this.paymentMethodsError.set('Unable to check online payment availability. Cash is still available. Try again to check QR payment methods.'),
    });
  }

  protected eventTypeLabel(eventType: EventType | null): string {
    return this.eventTypes.find((item) => item.value === eventType)?.label ?? 'Not provided';
  }

  protected async confirmBooking(): Promise<void> {
    const catalogError = this.draftService.catalogSelectionError();
    if (catalogError) {
      this.submissionError.set(catalogError);
      this.currentStep.set(2);
      return;
    }
    if (!this.revalidateDate()) {
      this.currentStep.set(1);
      this.furthestStep.set(1);
      return;
    }
    const draft = this.draftService.draft();
    const selectedPackage = this.draftService.selectedPackage();
    if (!selectedPackage || this.isSubmitting()) return;
    if (!draft.eventType || !this.packageMatchesEvent(selectedPackage, draft.eventType)) {
      const packageControl = this.eventForm.controls.packageId;
      packageControl.setErrors({ ...packageControl.errors, packageEvent: true });
      this.submissionError.set('Choose a package that matches the selected event type.');
      this.currentStep.set(1);
      return;
    }
    this.isSubmitting.set(true);
    this.submissionError.set('');
    try {
      const editingId = this.editingBookingId();
      if (editingId) {
        const updated = await this.bookingService.updatePendingBooking(editingId, { ...draft, paymentMethod: null }, selectedPackage, this.draftService.selectedAddOns());
        this.bookingReference.set(updated.reference);
      } else {
        this.bookingReference.set(await this.bookingService.submitDraft({ ...draft, paymentMethod: null }, selectedPackage, this.draftService.selectedAddOns(), this.draftService.submissionKey()));
      }
      this.draftService.reset();
      await this.router.navigate(['/dashboard'], {
        state: { bookingReference: this.bookingReference(), bookingUpdated: !!editingId },
      });
    } catch (error) {
      const message = bookingSubmissionMessage(error);
      this.submissionError.set(message);
      if (isBookingCapacityConflict(error)) {
        this.currentStep.set(1);
        this.availabilityConflictMessage.set(message);
        this.retryAvailability();
        setTimeout(() => this.availabilityFeedback()?.nativeElement.focus());
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected controlInvalid(controlName: keyof BookingPageComponent['eventForm']['controls']): boolean {
    const control = this.eventForm.controls[controlName];
    return control.invalid && control.touched;
  }

  protected selectedFormPackage() {
    return this.packageService.getPackageById(this.eventForm.controls.packageId.value);
  }

  protected guestInputMax(): number {
    return Math.min(this.selectedFormPackage()?.maxGuests ?? 1500, 1500);
  }

  protected guestCountInvalid(): boolean {
    const control = this.eventForm.controls.guestCount;
    return control.invalid && (control.dirty || control.touched || control.value > 1500);
  }

  protected guestCountError(): string {
    const value = this.eventForm.controls.guestCount.value;
    if (value > 1500) return 'Maximum of 1,500 guests only.';
    if (!Number.isSafeInteger(value) || value < 1) return 'Enter a whole number from 1 to 1,500.';
    const pkg = this.selectedFormPackage();
    return pkg ? this.packageGuestError(pkg) : 'Enter a whole number from 1 to 1,500.';
  }

  protected compatiblePackages(): readonly CateringPackage[] {
    const eventType = this.eventForm.controls.eventType.value;
    return this.packageService.packages().filter(pkg => this.packageMatchesEvent(pkg, eventType));
  }

  protected packagePricingLabel(pkg: CateringPackage): string {
    const name = pkg.name.replace(/\bPHP\s*/gi, '₱');
    if (/₱\s*\d/.test(name)) return name;
    return pkg.pricingType === 'BASE_PLUS_EXCESS'
      ? `${name} – ₱${this.formatAmount(pkg.basePrice)}`
      : `${name} – ₱${this.formatAmount(pkg.pricePerGuest)} Per Head`;
  }

  protected packagePricingExplanation(pkg: CateringPackage): string {
    if (pkg.pricingType === 'BASE_PLUS_EXCESS') {
      return `PHP ${this.formatAmount(pkg.basePrice)} includes ${pkg.includedGuests ?? 0} guests, then PHP ${this.formatAmount(pkg.excessGuestPrice)} for each additional guest.`;
    }
    return `PHP ${this.formatAmount(pkg.pricePerGuest)} for each estimated guest.`;
  }

  protected packageGuestGuidance(pkg: CateringPackage): string {
    if (pkg.minGuests !== null && pkg.maxGuests !== null) {
      return `This package accommodates ${pkg.minGuests}-${pkg.maxGuests} guests.`;
    }
    if (pkg.minGuests !== null) return `This package requires at least ${pkg.minGuests} guests.`;
    if (pkg.maxGuests !== null) return `This package accommodates up to ${pkg.maxGuests} guests.`;
    return 'Enter your best estimate. LA Chef will confirm final capacity during review.';
  }

  protected packageGuestError(pkg: CateringPackage): string {
    if (pkg.minGuests !== null && pkg.maxGuests !== null) {
      return `Guest count must be between ${pkg.minGuests} and ${pkg.maxGuests}.`;
    }
    if (pkg.minGuests !== null) return `Guest count must be at least ${pkg.minGuests}.`;
    if (pkg.maxGuests !== null) return `Guest count must not exceed ${pkg.maxGuests}.`;
    return 'Enter a whole number from 1 to 1,500.';
  }

  private formatAmount(value: number | null): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value ?? 0);
  }

  private applyPackageDefaults(packageId: string, alignEventType: boolean): void {
    this.pendingPackageDefaults = packageId ? { id: packageId, alignEventType } : null;
    const pkg = this.packageService.getPackageById(packageId);
    if (!pkg) return;
    this.pendingPackageDefaults = null;
    const guests = this.eventForm.controls.guestCount;
    const included = pkg.includedGuests;
    const canDefaultGuests = guests.value === null || (!guests.dirty && (
      (guests.value === 1 && this.furthestStep() === 1 && !this.editingBookingId())
      || (this.defaultGuestCount !== null && guests.value === this.defaultGuestCount)
    ));
    if (alignEventType || !this.eventForm.controls.eventType.value || pkg.category !== 'standard') this.alignEventTypeWithPackage(packageId);
    if (pkg.pricingType === 'BASE_PLUS_EXCESS' && included !== null && Number.isSafeInteger(included)
      && included >= Math.max(pkg.minGuests ?? 1, 1) && included <= Math.min(pkg.maxGuests ?? 1500, 1500)
      && canDefaultGuests) {
      guests.setValue(included);
      guests.markAsPristine();
      this.defaultGuestCount = included;
      this.draftService.update({ guestCount: included });
    }
  }

  private alignEventTypeWithPackage(packageId: string): void {
    const pkg = this.packageService.getPackageById(packageId);
    if (!pkg) return;
    if (pkg.category === 'standard') {
      this.eventForm.controls.eventType.enable({ emitEvent: false });
      return;
    }
    const eventType = pkg.category === 'custom' ? 'other' : pkg.category;
    if (this.eventForm.controls.eventType.value !== eventType) this.eventForm.controls.eventType.setValue(eventType);
    this.eventForm.controls.eventType.disable({ emitEvent: false });
    this.draftService.update({ eventType });
  }

  private packageMatchesEvent(pkg: CateringPackage, eventType: EventType | '' | null): boolean {
    if (!eventType || pkg.category === 'standard') return true;
    return pkg.category === eventType || (pkg.category === 'custom' && eventType === 'other');
  }

  private loadPendingBooking(bookingId: string, preserveDraft = false): void {
    this.editingBookingId.set(bookingId);
    this.draftService.editingBookingId.set(bookingId);
    this.editingLoading.set(true);
    this.editingError.set('');
    this.bookingService.loadBookingById(bookingId).pipe(
      finalize(() => this.editingLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (booking) => {
        if (!preserveDraft) { this.hydratePendingBooking(booking); return; }
        if (booking.status !== 'pending') {
          this.editingError.set('This booking can no longer be edited online. Contact LA Chef for assistance.');
          return;
        }
        this.revalidateDate();
      },
      error: (error) => this.editingError.set(bookingSubmissionMessage(error)),
    });
  }

  private hydratePendingBooking(booking: Booking): void {
    if (booking.status !== 'pending') {
      this.editingError.set('This booking can no longer be edited online. Contact LA Chef for assistance.');
      return;
    }
    const draft = {
      eventType: booking.eventType,
      eventDate: booking.eventDate,
      eventTime: this.toDisplayTime(booking.eventTime),
      venue: booking.venue,
      guestCount: booking.guestCount,
      packageId: booking.package.packageId,
      selectedAddOnIds: booking.addOns.map((addOn) => addOn.id),
      addOnQuantities: Object.fromEntries(booking.addOns.map(addOn => [addOn.id, addOn.quantity ?? 1])),
      paymentMethod: booking.paymentMethod ?? this.draftService.draft().paymentMethod,
      specialRequest: booking.specialRequest ?? '',
    };
    this.draftService.update(draft);
    this.eventForm.setValue({
      eventType: draft.eventType,
      eventDate: draft.eventDate,
      eventTime: draft.eventTime,
      venue: draft.venue,
      guestCount: draft.guestCount,
      packageId: draft.packageId,
      specialRequest: draft.specialRequest,
    });
    this.currentStep.set(1);
  }

  private toDisplayTime(value: string): string {
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return value;
    const hour = Number(match[1]);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${match[2]} ${suffix}`;
  }

  private futureDateValidator(control: FormControl<string>): ValidationErrors | null {
    return control.value && !this.isEventDateAvailable(control.value) ? { advanceDate: true } : null;
  }

  private isEventDateAvailable(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
      && date >= this.minimumBookingDate;
  }

  private revalidateDate(): boolean {
    const control = this.eventForm.controls.eventDate;
    control.updateValueAndValidity({ emitEvent: false });
    this.dateUnavailable.set(!!control.value && control.invalid);
    return control.valid;
  }

  private watchAvailability(): void {
    const queryChanges = combineLatest([
      this.eventForm.controls.eventDate.valueChanges.pipe(startWith(this.eventForm.controls.eventDate.value)),
      this.eventForm.controls.guestCount.valueChanges.pipe(startWith(this.eventForm.controls.guestCount.value)),
    ]).pipe(
      tap(([date, guestCount]) => {
        this.eventForm.controls.eventDate.updateValueAndValidity({ emitEvent: false });
        this.dateUnavailable.set(!!date && !this.isEventDateAvailable(date));
        if (this.calendarOpen() && guestCount !== this.calendarLoadedGuestCount) this.loadCalendarMonth();
      }),
      map(([date, guestCount]) => this.toAvailabilityQuery(date, guestCount)),
      tap((query) => {
        const previousKey = this.currentAvailabilityQuery()?.key;
        this.currentAvailabilityQuery.set(query);
        if (query?.key !== previousKey) this.availabilityConflictMessage.set('');
        this.availabilityState.set(query ? { phase: 'checking', key: query.key } : { phase: 'idle' });
      }),
      debounceTime(300),
      filter((query): query is AvailabilityQuery => query !== null),
    );
    const retries = this.retryAvailabilityRequest.pipe(
      map(() => this.currentAvailabilityQuery()),
      filter((query): query is AvailabilityQuery => query !== null),
    );

    merge(queryChanges, retries).pipe(
      tap((query) => this.availabilityState.set({ phase: 'checking', key: query.key })),
      switchMap((query) => (this.editingBookingId()
        ? this.bookingService.checkAvailability(query.date, query.guestCount, this.editingBookingId()!)
        : this.bookingService.checkAvailability(query.date, query.guestCount)).pipe(
        map((data): AvailabilityState => ({ phase: 'ready', key: query.key, data })),
        catchError(() => of<AvailabilityState>({
          phase: 'error',
          key: query.key,
          message: 'We could not check this date right now. Please try again.',
        })),
        map((state) => ({ query, state })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ query, state }) => {
      if (this.currentAvailabilityQuery()?.key === query.key) this.availabilityState.set(state);
    });
  }

  private toAvailabilityQuery(date: string, guestCount: number): AvailabilityQuery | null {
    const validDate = this.isEventDateAvailable(date);
    const validGuestCount = Number.isSafeInteger(guestCount) && guestCount >= 1 && guestCount <= 1500;
    return validDate && validGuestCount
      ? { date, guestCount, key: `${date}:${guestCount}` }
      : null;
  }
}
