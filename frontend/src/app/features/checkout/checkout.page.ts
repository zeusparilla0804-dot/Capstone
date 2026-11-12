import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PaymentMethod } from '../../core/models';
import { BookingDraftService } from '../../core/services/booking-draft.service';
import { BookingService } from '../../core/services/booking.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { bookingSubmissionMessage } from '../booking/booking-submission-error';

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
  ];

  protected selectPayment(paymentMethod: PaymentMethod): void {
    if (paymentMethod === 'gcash') return;
    this.draftService.update({ paymentMethod });
  }

  protected eventTypeLabel(): string {
    const eventType = this.draftService.draft().eventType;
    if (!eventType) return 'Not provided';
    return eventType === 'corporate' ? 'Corporate Event' : eventType.charAt(0).toUpperCase() + eventType.slice(1);
  }

  protected async confirmBooking(): Promise<void> {
    const catalogError = this.draftService.catalogSelectionError();
    if (catalogError) {
      this.errorMessage.set(catalogError);
      return;
    }
    const selectedPackage = this.draftService.selectedPackage();
    const draft = this.draftService.draft();
    if (!selectedPackage || !draft.paymentMethod || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const editingId = this.draftService.editingBookingId();
      if (editingId) {
        const updated = await this.bookingService.updatePendingBooking(editingId, draft, selectedPackage, this.draftService.selectedAddOns());
        this.bookingReference.set(updated.reference);
      } else {
        this.bookingReference.set(await this.bookingService.submitDraft(draft, selectedPackage, this.draftService.selectedAddOns(), this.draftService.submissionKey()));
      }
      this.draftService.reset();
    } catch (error) {
      this.errorMessage.set(bookingSubmissionMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
