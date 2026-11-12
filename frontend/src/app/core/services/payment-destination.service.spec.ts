import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentDestinationService } from './payment-destination.service';

describe('supported payment destinations', () => {
  let service: PaymentDestinationService;
  let http: HttpTestingController;
  const base = environment.apiBaseUrl;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentDestinationService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('filters retired methods and accounts from an older API response', async () => {
    const methods = firstValueFrom(service.availableMethods());
    http.expectOne(`${base}/payment-destinations/methods`).flush({ data: ['E-WALLET', 'BANK_TRANSFER'] });
    expect(await methods).toEqual(['BANK_TRANSFER']);
    const list = firstValueFrom(service.list());
    http.expectOne(`${base}/admin/payment-destinations`).flush({ data: [{ id: 1, method: 'E-WALLET' }, { id: 2, method: 'BANK_TRANSFER' }] });
    expect((await list).map(item => item.id)).toEqual([2]);
    const queue = firstValueFrom(service.waitingBookings());
    http.expectOne(`${base}/admin/payment-destinations/waiting-bookings`).flush({ data: [{ id: 1, paymentMethod: 'E-WALLET' }, { id: 2, paymentMethod: 'BANK_TRANSFER' }] });
    expect((await queue).map(item => item.id)).toEqual([2]);
    const assigned = firstValueFrom(service.assigned('42'));
    http.expectOne(`${base}/payment-destinations/bookings/42`).flush({ data: { id: 1, method: 'E-WALLET' } });
    expect(await assigned).toBeNull();
  });

  it('does not send a request to create a GCash receiving account', async () => {
    await expect(firstValueFrom(service.save({ method: 'E-WALLET', label: 'Old', accountName: 'Old', accountHint: '1234' }))).rejects.toThrow(/bank transfer/i);
    http.expectNone(`${base}/admin/payment-destinations`);
  });
});
