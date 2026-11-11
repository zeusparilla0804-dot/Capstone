import { TestBed } from '@angular/core/testing';
import { BookingStepperComponent } from './booking-stepper';

describe('BookingStepperComponent navigation', () => {
  it('shows the resumed payment stage as step 4', () => {
    const fixture = TestBed.createComponent(BookingStepperComponent);
    fixture.componentRef.setInput('currentStep', 4);
    fixture.componentRef.setInput('furthestStep', 4);
    fixture.componentRef.setInput('showPayment', true);
    fixture.componentRef.setInput('navigationDisabled', true);
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    expect(buttons[3].textContent).toContain('Payment');
    expect(buttons[3].getAttribute('aria-current')).toBe('step');
    expect(buttons.every(button => button.disabled)).toBe(true);
  });
  it('uses disabled semantic buttons for locked steps and emits unlocked selections', () => {
    const fixture = TestBed.createComponent(BookingStepperComponent);
    fixture.componentRef.setInput('currentStep', 2);
    fixture.componentRef.setInput('furthestStep', 2);
    const selected = vi.fn();
    fixture.componentInstance.stepSelected.subscribe(selected);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(3);
    expect(buttons.map(button => button.disabled)).toEqual([false, false, true]);
    buttons[0].click();
    buttons[2].click();
    expect(selected.mock.calls).toEqual([[1]]);
    expect(buttons[1].getAttribute('aria-current')).toBe('step');
  });
});
