import { TestBed } from '@angular/core/testing';
import { BookingStepperComponent } from './booking-stepper';

describe('BookingStepperComponent navigation', () => {
  it('uses disabled semantic buttons for locked steps and emits unlocked selections', () => {
    const fixture = TestBed.createComponent(BookingStepperComponent);
    fixture.componentRef.setInput('currentStep', 2);
    fixture.componentRef.setInput('furthestStep', 3);
    const selected = vi.fn();
    fixture.componentInstance.stepSelected.subscribe(selected);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    expect(buttons.map(button => button.disabled)).toEqual([false, false, false, true]);
    buttons[0].click();
    buttons[3].click();
    expect(selected.mock.calls).toEqual([[1]]);
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
  });
});
