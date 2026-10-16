import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, debounceTime, distinctUntilChanged, filter, finalize, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Booking, BookingAvailability, CateringPackage, EventType, PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { BookingStepperComponent } from './components/booking-stepper/booking-stepper';
import { bookingSubmissionMessage, isBookingCapacityConflict } from './booking-submission-error';

type BookingStep = 1 | 2 | 3 | 4;
type AvailabilityQuery = Readonly<{ date: string; guestCount: number; key: string }>;
type AvailabilityState =
  | Readonly<{ phase: 'idle' }>
  | Readonly<{ phase: 'checking'; key: string }>
  | Readonly<{ phase: 'ready'; key: string; data: BookingAvailability }>
  | Readonly<{ phase: 'error'; key: string; message: string }>;

@Component({
  selector: 'app-booking-page',
  imports: [BookingStepperComponent, CurrencyPipe, DatePipe, PublicHeaderComponent, ReactiveFormsModule, RouterLink],
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
  protected readonly draftService = inject(BookingDraftService);
  protected readonly packageService = inject(PackageService);

  protected readonly currentStep = signal<BookingStep>(1);
  protected readonly editingBookingId = signal<string | null>(null);
  protected readonly editingLoading = signal(false);
  protected readonly editingError = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly submissionError = signal('');
  protected readonly availabilityConflictMessage = signal('');
  protected readonly availabilityState = signal<AvailabilityState>({ phase: 'idle' });
  protected readonly canContinueToAddOns = computed(() => {
    const query = this.currentAvailabilityQuery();
    const state = this.availabilityState();
    return query !== null
      && state.phase === 'ready'
      && state.key === query.key
      && state.data.status !== 'FULL';
  });
  protected readonly bookingReference = signal('');
  protected readonly minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  protected readonly eventTypes: readonly { value: EventType; label: string }[] = [
    { value: 'wedding', label: 'Wedding' }, { value: 'birthday', label: 'Birthday' },
    { value: 'corporate', label: 'Corporate Event' }, { value: 'debut', label: 'Debut' },
    { value: 'anniversary', label: 'Anniversary' }, { value: 'other', label: 'Other' },
  ];
  protected readonly eventTimes = ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM'];
  protected readonly paymentMethods: readonly { value: PaymentMethod; label: string; description: string }[] = [
    { value: 'cash', label: 'Cash', description: 'Pay according to LA Chef payment instructions.' },
    { value: 'bank-transfer', label: 'Bank Transfer', description: 'Transfer details will be provided after approval.' },
    { value: 'gcash', label: 'GCash', description: 'Payment instructions will follow after approval.' },
  ];

  protected readonly eventForm = new FormGroup({
    eventType: new FormControl<EventType | ''>('', { nonNullable: true, validators: Validators.required }),
    eventDate: new FormControl('', { nonNullable: true, validators: [Validators.required, this.futureDateValidator.bind(this)] }),
    eventTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    guestCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(10_000)] }),
    packageId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    specialRequest: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
  });

  constructor() {
    this.packageService.load();
    this.draftService.loadAddOns();
    const existing = this.draftService.draft();
    const requestedPackage = this.route.snapshot.queryParamMap.get('package');
    if (requestedPackage) this.draftService.selectPackage(requestedPackage);
    const draft = this.draftService.draft();
    this.eventForm.setValue({
      eventType: draft.eventType ?? existing.eventType ?? '', eventDate: draft.eventDate,
      eventTime: draft.eventTime, venue: draft.venue, guestCount: draft.guestCount,
      packageId: draft.packageId ?? '', specialRequest: draft.specialRequest ?? '',
    });
    const requestedStep = Number(this.route.snapshot.queryParamMap.get('step'));
    if (draft.packageId && requestedStep >= 2 && requestedStep <= 4) {
      this.currentStep.set(requestedStep as BookingStep);
    }
    this.watchAvailability();
    const requestedBooking = this.route.snapshot.queryParamMap.get('booking');
    if (requestedBooking) this.loadPendingBooking(requestedBooking);
  }

  protected continueToAddOns(): void {
    const value = this.eventForm.getRawValue();
    const selectedPackage = this.packageService.getPackageById(value.packageId);
    const guestControl = this.eventForm.controls.guestCount;
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
    if (this.eventForm.invalid || !this.canContinueToAddOns()) { this.eventForm.markAllAsTouched(); return; }
    this.draftService.update({
      ...value,
      eventType: value.eventType as EventType,
      packageId: value.packageId,
      specialRequest: value.specialRequest.trim() || undefined,
    });
    this.currentStep.set(2);
  }

  protected goToStep(step: BookingStep): void { this.currentStep.set(step); }
  protected retryAvailability(): void {
    if (this.currentAvailabilityQuery()) this.retryAvailabilityRequest.next();
  }
  protected isAddOnSelected(addOnId: string): boolean { return this.draftService.draft().selectedAddOnIds.includes(addOnId); }
  protected selectPayment(method: PaymentMethod): void { this.draftService.update({ paymentMethod: method }); }
  protected eventTypeLabel(eventType: EventType | null): string {
    return this.eventTypes.find((item) => item.value === eventType)?.label ?? 'Not provided';
  }

  protected async confirmBooking(): Promise<void> {
    const draft = this.draftService.draft();
    const selectedPackage = this.draftService.selectedPackage();
    if (!draft.paymentMethod || !selectedPackage || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.submissionError.set('');
    try {
      const editingId = this.editingBookingId();
      if (editingId) {
        const updated = await this.bookingService.updatePendingBooking(editingId, draft, selectedPackage, this.draftService.selectedAddOns());
        this.bookingReference.set(updated.reference);
      } else {
        this.bookingReference.set(await this.bookingService.submitDraft(draft, selectedPackage, this.draftService.selectedAddOns()));
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

  protected packagePricingLabel(pkg: CateringPackage): string {
    if (pkg.pricingType === 'BASE_PLUS_EXCESS') {
      return `${pkg.name} - PHP ${this.formatAmount(pkg.basePrice)} package`;
    }
    return `${pkg.name} - PHP ${this.formatAmount(pkg.pricePerGuest)} per guest`;
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
    return 'Enter a guest estimate between 1 and 10,000.';
  }

  private formatAmount(value: number | null): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value ?? 0);
  }

  private loadPendingBooking(bookingId: string): void {
    this.editingBookingId.set(bookingId);
    this.editingLoading.set(true);
    this.editingError.set('');
    this.bookingService.loadBookingById(bookingId).pipe(
      finalize(() => this.editingLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (booking) => this.hydratePendingBooking(booking),
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
    return control.value && control.value < this.minDate ? { pastDate: true } : null;
  }

  private watchAvailability(): void {
    const queryChanges = combineLatest([
      this.eventForm.controls.eventDate.valueChanges.pipe(startWith(this.eventForm.controls.eventDate.value)),
      this.eventForm.controls.guestCount.valueChanges.pipe(startWith(this.eventForm.controls.guestCount.value)),
    ]).pipe(
      map(([date, guestCount]) => this.toAvailabilityQuery(date, guestCount)),
      tap((query) => {
        const previousKey = this.currentAvailabilityQuery()?.key;
        this.currentAvailabilityQuery.set(query);
        if (query?.key !== previousKey) this.availabilityConflictMessage.set('');
        this.availabilityState.set(query ? { phase: 'checking', key: query.key } : { phase: 'idle' });
      }),
      debounceTime(300),
      distinctUntilChanged((previous, current) => previous?.key === current?.key),
      filter((query): query is AvailabilityQuery => query !== null),
    );
    const retries = this.retryAvailabilityRequest.pipe(
      map(() => this.currentAvailabilityQuery()),
      filter((query): query is AvailabilityQuery => query !== null),
    );

    merge(queryChanges, retries).pipe(
      tap((query) => this.availabilityState.set({ phase: 'checking', key: query.key })),
      switchMap((query) => this.bookingService.checkAvailability(query.date, query.guestCount).pipe(
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
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= this.minDate;
    const validGuestCount = Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 10_000;
    return validDate && validGuestCount
      ? { date, guestCount, key: `${date}:${guestCount}` }
      : null;
  }
}
