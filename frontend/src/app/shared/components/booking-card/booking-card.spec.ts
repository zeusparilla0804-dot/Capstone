import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Booking } from '../../../core/models';
import { BookingCardComponent } from './booking-card';

const booking: Booking = {
  id: '27', reference: 'BK-EDIT', customerId: '', eventName: 'Wedding Event', eventType: 'wedding',
  eventDate: '2027-01-12', eventTime: '15:00', venue: 'Venue', guestCount: 75,
  package: { packageId: '10', packageName: 'Wedding Package', pricingType: 'PER_HEAD',
    pricePerGuest: 720, basePrice: null, includedGuests: null, excessGuestPrice: null, packageTotal: 54_000 },
  addOns: [], discount: 0, status: 'pending', amountPaid: 0,
  createdAt: '2026-10-10T00:00:00Z', thumbnailUrl: 'test.png',
};

describe('BookingCardComponent pending actions', () => {
  it('lets the customer pay only the missing deposit after a smaller verified bank payment', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    const partial = { ...booking, total: 154000, status: 'awaiting_payment', paymentMethod: 'bank-transfer', paymentQrReady: true, amountPaid: 70000 };
    fixture.componentRef.setInput('booking', partial); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Down Payment Incomplete');
    expect(fixture.nativeElement.querySelector('[data-testid="deposit-shortfall"]').textContent).toContain('7,000.00');
    const action = fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]');
    expect(action?.textContent).toContain('Pay remaining down payment');
    fixture.componentRef.setInput('reservationLayout', true); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="deposit-shortfall"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Down Payment Incomplete');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')?.textContent).toContain('Pay remaining down payment');
    fixture.componentRef.setInput('booking', { ...partial, status: 'payment_submitted', latestProofStatus: 'SUBMITTED' }); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Pay remaining down payment');
    expect(fixture.nativeElement.textContent).toContain('View Payment');
    fixture.componentRef.setInput('booking', { ...partial, status: 'payment_verified', amountPaid: 77000 }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="deposit-shortfall"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')?.textContent).toContain('Pay remaining balance');
  });
  it('shows both Completed and Fully Paid with a receipt link after final payment', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', { ...booking, invoiceId: 8, status: 'completed', amountPaid: 54000 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Completed');
    expect(fixture.nativeElement.textContent).toContain('Fully Paid');
    expect(fixture.nativeElement.textContent).toContain('View Receipt');
    expect(fixture.nativeElement.textContent).not.toContain('Submit Payment');
  });
  it('offers bank selection even when no administrator QR was assigned', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', { ...booking, status: 'awaiting_payment', paymentMethod: 'bank-transfer', paymentQrReady: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="waiting-payment-qr"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')?.textContent).toContain('Submit Payment');
  });
  it('offers payment selection only after admin approval', async () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Choose Payment Method');
    fixture.componentRef.setInput('booking', { ...booking, status: 'approved' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')).toBeNull();
    fixture.componentRef.setInput('booking', { ...booking, status: 'awaiting_payment' });
    fixture.detectChanges();
    await fixture.whenStable();
    const paymentLink = [...fixture.nativeElement.querySelectorAll('a')].find((link: HTMLAnchorElement) => link.textContent?.includes('Choose Payment Method')) as HTMLAnchorElement;
    expect(paymentLink).toBeDefined();
    expect(paymentLink.getAttribute('href')).toBe('/book-event?paymentBooking=27&step=4');
  });
  it('links cash customers to instructions instead of requesting an online payment', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', { ...booking, paymentMethod: 'cash', status: 'awaiting_payment' });
    fixture.detectChanges();
    const action = fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]') as HTMLAnchorElement;
    expect(action?.textContent).toContain('View Cash Instructions');
    expect(fixture.nativeElement.querySelector('app-status-badge')?.textContent).toContain('Awaiting Cash Payment');
    fixture.componentRef.setInput('booking', { ...booking, paymentMethod: 'cash', status: 'payment_verified', amountPaid: 27000 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')).not.toBeNull();
  });

  it('keeps a remaining balance action after a verified deposit and removes it at full payment', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', { ...booking, invoiceId: 8, paymentMethod: 'bank-transfer', status: 'awaiting_payment', paymentQrReady: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Submit Payment');
    expect(fixture.nativeElement.textContent).toContain('View Invoice');
    fixture.componentRef.setInput('booking', { ...booking, invoiceId: 8, paymentMethod: 'bank-transfer', status: 'payment_verified', amountPaid: 27000 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Submit Payment');
    expect(fixture.nativeElement.textContent).toContain('View Receipt');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')?.textContent).toContain('Pay remaining balance');
    fixture.componentRef.setInput('booking', { ...booking, paymentMethod: 'bank-transfer', status: 'confirmed', amountPaid: 54000 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings/27/payment"]')).toBeNull();
  });

  it('groups reservation status and available actions in one labelled side rail', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();

    const sideRail = fixture.nativeElement.querySelector('[aria-label="Reservation status and actions"]') as HTMLElement;

    expect(sideRail).not.toBeNull();
    expect(sideRail.querySelector('app-status-badge')).not.toBeNull();
    expect(sideRail.querySelector('.booking-card__actions')).not.toBeNull();
  });

  it('keeps venue close to the date in a compact left-aligned details grid', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('.booking-card dl') as HTMLElement;
    const styles = getComputedStyle(details);

    expect(styles.justifyContent).toBe('start');
    expect(styles.gridTemplateColumns).toContain('260px');
  });

  it('offers an edit link only while the booking is pending', () => {
    TestBed.configureTestingModule({ imports: [BookingCardComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BookingCardComponent);
    fixture.componentRef.setInput('booking', booking);
    fixture.detectChanges();

    const edit = fixture.nativeElement.querySelector('[data-testid="edit-booking"]') as HTMLAnchorElement;
    expect(edit?.getAttribute('href')).toBe('/book-event?booking=27');

    fixture.componentRef.setInput('booking', { ...booking, status: 'approved' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="edit-booking"]')).toBeNull();
  });
});
