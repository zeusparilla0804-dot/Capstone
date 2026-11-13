import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PaymentDestinationService } from '../../core/services/payment-destination.service';
import { AdminPaymentQrsPage } from './admin-payment-qrs.page';

describe('administrator bank accounts', () => {
  it('manages available accounts without assigning one to each customer', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:qr'); URL.revokeObjectURL = vi.fn();
    const api = { list: vi.fn(() => of([{ id: 2, method: 'BANK_TRANSFER', label: 'Bank B', accountName: 'LA Chef', accountHint: '2222', isAvailable: true }])),
      image: vi.fn(() => of(new Blob(['qr']))), waitingBookings: vi.fn(() => of([])) };
    TestBed.configureTestingModule({ imports: [AdminPaymentQrsPage], providers: [provideRouter([]), { provide: PaymentDestinationService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminPaymentQrsPage); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Bank B');
    expect(fixture.nativeElement.textContent).toContain('Customers choose');
    expect(fixture.nativeElement.querySelector('#qr-assign-title')).toBeNull();
    expect(api.waitingBookings).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('booking assignments');
  });
});
