import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-booking-stepper',
  templateUrl: './booking-stepper.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking-stepper.scss',
})
export class BookingStepperComponent {
  readonly currentStep = input.required<number>();
  protected readonly steps = ['Event Details', 'Add-ons', 'Review', 'Payment'];
}
