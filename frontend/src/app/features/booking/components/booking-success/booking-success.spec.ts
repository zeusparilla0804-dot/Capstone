import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BookingSuccessComponent } from './booking-success';

describe('BookingSuccessComponent', () => {
  it('shows the submitted state and booking reference', () => {
    TestBed.configureTestingModule({ imports: [BookingSuccessComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingSuccessComponent);
    fixture.componentRef.setInput('bookingReference', 'BK-2026-001');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Booking request submitted');
    expect(fixture.nativeElement.textContent).toContain('BK-2026-001');
    expect(fixture.nativeElement.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
  });
  it('shows the update confirmation while editing', () => {
    TestBed.configureTestingModule({ imports: [BookingSuccessComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingSuccessComponent);
    fixture.componentRef.setInput('bookingReference', 'BK-EDIT');
    fixture.componentRef.setInput('isEditing', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Booking updated');
    expect(fixture.nativeElement.textContent).toContain('BK-EDIT');
  });
});
