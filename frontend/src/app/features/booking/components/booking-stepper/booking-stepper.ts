import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-booking-stepper',
  templateUrl: './booking-stepper.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './booking-stepper.scss',
})
export class BookingStepperComponent {
  readonly currentStep = input.required<number>();
  readonly furthestStep = input(1);
  readonly navigationDisabled = input(false);
  readonly stepSelected = output<number>();
  protected readonly steps = ['Event Details', 'Add-ons', 'Review', 'Payment'];
}
