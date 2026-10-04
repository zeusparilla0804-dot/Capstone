import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

@Component({
  selector: 'app-checkout-page',
  imports: [CurrencyPipe, DatePipe, PublicHeaderComponent, RouterLink],
  templateUrl: './checkout.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './checkout.page.scss',
})
export class CheckoutPageComponent {
  protected readonly draftService = inject(BookingDraftService);
  private readonly bookingService = inject(BookingService);
  protected readonly isSubmitting = signal(false);
  protected readonly bookingReference = signal('');
  protected readonly errorMessage = signal('');
  protected readonly methods: readonly { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' }, { value: 'bank-transfer', label: 'Bank Transfer' },
    { value: 'gcash', label: 'GCash' }, { value: 'card', label: 'Credit / Debit Card' },
  ];

  protected selectPayment(paymentMethod: PaymentMethod): void { this.draftService.update({ paymentMethod }); }
  protected eventTypeLabel(): string {
    const eventType = this.draftService.draft().eventType;
    if (!eventType) return 'Not provided';
    return eventType === 'corporate' ? 'Corporate Event' : eventType.charAt(0).toUpperCase() + eventType.slice(1);
  }

  protected async confirmBooking(): Promise<void> {
    const selectedPackage = this.draftService.selectedPackage();
    const draft = this.draftService.draft();
    if (!selectedPackage || !draft.paymentMethod || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      this.bookingReference.set(await this.bookingService.submitDraft(draft, selectedPackage, this.draftService.selectedAddOns()));
      this.draftService.reset();
    } catch {
      this.errorMessage.set("We couldn't submit your booking. Please try again.");
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
