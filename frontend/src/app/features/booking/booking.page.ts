import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventType, PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PackageService } from '../../core/services/package.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { BookingStepperComponent } from './components/booking-stepper/booking-stepper';

type BookingStep = 1 | 2 | 3 | 4;

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
  protected readonly draftService = inject(BookingDraftService);
  protected readonly packageService = inject(PackageService);

  protected readonly currentStep = signal<BookingStep>(1);
  protected readonly isSubmitting = signal(false);
  protected readonly submissionError = signal('');
  protected readonly bookingReference = signal('');
  protected readonly minDate = new Date().toISOString().slice(0, 10);
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
    { value: 'card', label: 'Credit / Debit Card', description: 'Card payment is arranged after booking approval.' },
  ];

  protected readonly eventForm = new FormGroup({
    eventType: new FormControl<EventType | ''>('', { nonNullable: true, validators: Validators.required }),
    eventDate: new FormControl('', { nonNullable: true, validators: [Validators.required, this.futureDateValidator.bind(this)] }),
    eventTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    guestCount: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    packageId: new FormControl('', { nonNullable: true, validators: Validators.required }),
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
      packageId: draft.packageId ?? '',
    });
    const requestedStep = Number(this.route.snapshot.queryParamMap.get('step'));
    if (draft.packageId && requestedStep >= 2 && requestedStep <= 4) {
      this.currentStep.set(requestedStep as BookingStep);
    }
  }

  protected continueToAddOns(): void {
    if (this.eventForm.invalid) { this.eventForm.markAllAsTouched(); return; }
    const value = this.eventForm.getRawValue();
    this.draftService.update({ ...value, eventType: value.eventType as EventType, packageId: value.packageId });
    this.currentStep.set(2);
  }

  protected goToStep(step: BookingStep): void { this.currentStep.set(step); }
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
      this.bookingReference.set(await this.bookingService.submitDraft(draft, selectedPackage, this.draftService.selectedAddOns()));
      this.draftService.reset();
    } catch {
      this.submissionError.set("We couldn't submit your booking. Please try again.");
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected controlInvalid(controlName: keyof BookingPageComponent['eventForm']['controls']): boolean {
    const control = this.eventForm.controls[controlName];
    return control.invalid && control.touched;
  }

  private futureDateValidator(control: FormControl<string>): ValidationErrors | null {
    return control.value && control.value < this.minDate ? { pastDate: true } : null;
  }
}
