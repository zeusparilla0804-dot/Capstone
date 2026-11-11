import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { SuccessDialogComponent } from '../../../../shared/components/success-dialog/success-dialog';

@Component({
  selector: 'app-booking-success',
  imports: [SuccessDialogComponent],
  templateUrl: './booking-success.html',
  styleUrl: './booking-success.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class BookingSuccessComponent {
  private readonly router = inject(Router);
  readonly bookingReference = input.required<string>();
  readonly isEditing = input(false);

  protected close(): void {
    void this.router.navigate(['/dashboard']);
  }
}
