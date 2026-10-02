import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';

describe('AdminService booking status', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('includes an optional cancellation reason in the status request', () => {
    Reflect.apply(service.updateBookingStatus, service, [5, 'CANCELLED', 'Plans changed']).subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/bookings/5/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: 'CANCELLED', reason: 'Plans changed' });
    request.flush({ success: true });
  });

  it('sends ordinary status changes without a reason', () => {
    service.updateBookingStatus(5, 'APPROVED').subscribe();
    const request = http.expectOne(`${environment.apiBaseUrl}/admin/bookings/5/status`);
    expect(request.request.body).toEqual({ status: 'APPROVED' });
    request.flush({ success: true });
  });
});
