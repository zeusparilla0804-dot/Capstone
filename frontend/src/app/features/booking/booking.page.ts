import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, filter, finalize, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Booking, BookingAvailability, CateringPackage, EventType, PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { BookingSuccessComponent } from './components/booking-success/booking-success';
import { BookingStepperComponent } from './components/booking-stepper/booking-stepper';
import { bookingSubmissionMessage, isBookingCapacityConflict } from './booking-submission-error';
import { cashDepositDeadline, minimumCashEventDate } from '../../core/utils/cash-payment-policy';

type BookingStep = 1 | 2 | 3 | 4;
type AvailabilityQuery = Readonly<{ date: string; guestCount: number; key: string }>;
type AvailabilityState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'checking'; key: string }>
  | Readonly<{ phase: 'ready'; key: string; data: BookingAvailability }>
  | Readonly<{ phase: 'error'; key: string; message: string }>;

@Component({
  selector: 'app-booking-page',
  imports: [BookingStepperComponent, BookingSuccessComponent, CurrencyPipe, DatePipe, PublicHeaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './booking.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking.page.scss',
})
export class BookingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly bookingService = inject(BookingService);
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
  protected readonly canContinueToAddOns = computed(() => {
    const query = this.currentAvailabilityQuery();
    const state = this.availabilityState();
    return !this.dateUnavailable() && query !== null
      && state.phase === 'ready'
      && state.key === query.key
      && state.data.status !== 'FULL';
  });
  protected readonly bookingReference = signal('');
  protected get minDate(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  private get minimumBookingDate(): string {
    if (this.draftService.draft().paymentMethod === 'cash') {
      return minimumCashEventDate(this.eventForm?.controls.guestCount.value ?? this.draftService.draft().guestCount);
    }
    const date = new Date(`${this.minDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 3);
    return date.toISOString().slice(0, 10);
  }
  protected get dateValidationMessage(): string {
    return this.draftService.draft().paymentMethod === 'cash'
      ? `This event date is too soon for cash payment. Choose ${formatDate(this.minimumBookingDate + 'T00:00:00Z', 'MMMM d, y', 'en-US', 'UTC')} or later so the 50% deposit can be paid by 6:00 PM Philippine Time before preparation begins.`
      : 'Unavailable Date. Please select a date at least 3 days in advance.';
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
      if (!this.editingLoading()) this.applyPackageDefaults(packageId, true);
    });
    if (!requestedBooking) this.applyPackageDefaults(draft.packageId ?? '', !!requestedPackage);
    effect(() => {
      this.packageService.packages();
      const pending = this.pendingPackageDefaults;
      if (pending && !this.editingLoading()) this.applyPackageDefaults(pending.id, pending.alignEventType);
    });
    const requestedStep = Number(this.route.snapshot.queryParamMap.get('step'));
    if (draft.packageId && requestedStep >= 2 && requestedStep <= this.furthestStep()) {
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
    if (!Number.isInteger(step) || step < 1 || step > this.furthestStep()) return;
    this.goToStep(step as BookingStep);
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
  protected isAddOnSelected(addOnId: string): boolean { return this.draftService.draft().selectedAddOnIds.includes(addOnId); }
  protected selectPayment(method: PaymentMethod): void {
    this.draftService.update({ paymentMethod: method });
    this.revalidateDate();
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
    if (!draft.paymentMethod || !selectedPackage || this.isSubmitting()) return;
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
        const updated = await this.bookingService.updatePendingBooking(editingId, draft, selectedPackage, this.draftService.selectedAddOns());
        this.bookingReference.set(updated.reference);
      } else {
        this.bookingReference.set(await this.bookingService.submitDraft(draft, selectedPackage, this.draftService.selectedAddOns(), this.draftService.submissionKey()));
      }
      this.draftService.reset();
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
    if (alignEventType || !this.eventForm.controls.eventType.value) this.alignEventTypeWithPackage(packageId);
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
    if (!pkg || pkg.category === 'standard') return;
    const eventType = pkg.category === 'custom' ? 'other' : pkg.category;
    if (this.eventForm.controls.eventType.value === eventType) return;
    this.eventForm.controls.eventType.setValue(eventType);
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
      tap(([date]) => this.dateUnavailable.set(!!date && !this.isEventDateAvailable(date))),
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
