import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ActionFeedbackService } from '../services/action-feedback.service';
import { ACTION_FEEDBACK, actionFeedbackInterceptor } from './action-feedback.interceptor';

describe('Application action feedback', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let feedback: ActionFeedbackService;
  const url = (path: string) => `${environment.apiBaseUrl}${path}`;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([actionFeedbackInterceptor])), provideHttpClientTesting()] });
    client = TestBed.inject(HttpClient); http = TestBed.inject(HttpTestingController); feedback = TestBed.inject(ActionFeedbackService);
  });
  afterEach(() => http.verify());

  it('confirms customer sign-in without assuming this is their first or a returning visit', () => {
    client.post(url('/auth/login'), {}).subscribe();
    expect(feedback.notice()).toBeNull();
    http.expectOne(url('/auth/login')).flush({ success: true, data: { id: '7' } });
    expect(feedback.notice()).toMatchObject({ title: 'Signed in successfully', message: '', centered: true });
    feedback.dismiss();
    client.post(url('/auth/register'), {}).subscribe();
    http.expectOne(url('/auth/register')).flush({ success: true });
    expect(feedback.notice()).toMatchObject({ title: 'Account created', message: 'Check your email for the verification code to continue.' });
  });

  it.each(['/auth/admin/login', '/auth/admin/mfa/complete'])('shows the chosen admin sign-in message after %s succeeds', path => {
    client.post(url(path), {}).subscribe();
    http.expectOne(url(path)).flush({ success: true, data: { id: '1' } });
    expect(feedback.notice()).toMatchObject({ title: 'Signed in successfully', message: '', centered: true });
  });

  it('waits until MFA completes before showing admin sign-in success', () => {
    client.post(url('/auth/admin/login'), {}).subscribe();
    http.expectOne(url('/auth/admin/login')).flush({ success: true, data: { requiresMfa: true } });
    expect(feedback.notice()).toBeNull();
  });

  it('waits for a successful response before reporting cash recorded, including its receipt reference', () => {
    client.post(url('/admin/payments'), { amount: 123, method: 'CASH' }).subscribe();
    expect(feedback.notice()).toBeNull();
    http.expectOne(url('/admin/payments')).flush({ success: true, data: { reference: 'CASH-RECEIPT-123' } });
    expect(feedback.notice()).toMatchObject({ tone: 'success', title: 'Cash payment recorded' });
    expect(feedback.notice()?.message).toContain('CASH-RECEIPT-123');
  });

  it.each([
    ['/admin/bookings/9/complete', 'POST', { amount: 40000, method: 'CASH' }, 'Event completed'],
    ['/admin/payment-proofs/9/reject', 'POST', { reason: 'Wrong account' }, 'Payment proof rejected'],
    ['/admin/payment-proofs/9/verify', 'POST', { verifiedAmount: 123 }, 'Payment verified and recorded'],
    ['/admin/bookings/9/status', 'PATCH', { status: 'REJECTED' }, 'Reservation rejected'],
    ['/admin/bookings/9/status', 'PATCH', { status: 'CONFIRMED' }, 'Reservation confirmed'],
    ['/admin/packages/9/images', 'PUT', {}, 'Package images updated'],
    ['/admin/add-ons/9', 'PUT', { isActive: false }, 'Add-on saved'],
    ['/admin/payment-destinations/bookings/9/assignment', 'PUT', {}, 'Payment QR assigned'],
    ['/bookings/9/cancel', 'PATCH', {}, 'Reservation cancelled'],
    ['/auth/me/phone', 'PATCH', {}, 'Contact number updated'],
    ['/future-action', 'DELETE', {}, 'Changes saved'],
  ])('reports the real outcome for %s', (path, method, body, title) => {
    client.request(method, url(path), { body }).subscribe();
    http.expectOne(url(path)).flush({ success: true });
    expect(feedback.notice()).toMatchObject({ tone: 'success', title });
  });

  it('reports rejection failures as errors and preserves the HTTP error for the page', () => {
    const error = vi.fn();
    client.post(url('/admin/payment-proofs/9/reject'), {}).subscribe({ error });
    http.expectOne(url('/admin/payment-proofs/9/reject')).flush({ message: 'This proof was already reviewed.' }, { status: 409, statusText: 'Conflict' });
    expect(feedback.notice()).toMatchObject({ tone: 'error', message: 'This proof was already reviewed.' });
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not claim success for network failures or unsuccessful response bodies', () => {
    client.post(url('/admin/payments'), {}).subscribe({ error: () => {} });
    http.expectOne(url('/admin/payments')).error(new ProgressEvent('error'));
    expect(feedback.notice()).toMatchObject({ tone: 'error', title: 'Could not confirm action' });
    expect(feedback.notice()?.message).toContain('check the latest record');
    feedback.dismiss();
    client.put(url('/admin/packages/9'), {}).subscribe();
    http.expectOne(url('/admin/packages/9')).flush({ success: false, message: 'Package could not be saved.' });
    expect(feedback.notice()).toMatchObject({ tone: 'error', message: 'Package could not be saved.' });
  });

  it('keeps existing booking/payment success dialogs singular, while still showing their errors', () => {
    for (const path of ['/bookings', '/bookings/9/details', '/bookings/9/payment-method', '/bookings/9/payment-proofs', '/auth/admin/logout', '/auth/admin/logout-all', '/auth/logout', '/auth/logout-all']) {
      client.post(url(path), {}).subscribe(); http.expectOne(url(path)).flush({ success: true });
      expect(feedback.notice()).toBeNull();
    }
    client.patch(url('/admin/bookings/9/status'), { status: 'APPROVED' }).subscribe();
    http.expectOne(url('/admin/bookings/9/status')).flush({ success: true });
    expect(feedback.notice()).toBeNull();
    client.patch(url('/bookings/9/payment-method'), {}).subscribe({ error: () => {} });
    http.expectOne(url('/bookings/9/payment-method')).flush({ message: 'Method unavailable.' }, { status: 409, statusText: 'Conflict' });
    expect(feedback.notice()?.tone).toBe('error');
  });

  it('ignores background reads, notification read markers, external URLs and explicitly silent requests', () => {
    client.get(url('/admin/payments')).subscribe(); http.expectOne(url('/admin/payments')).flush({});
    for (const path of ['/notifications/read', '/admin/notifications/read']) {
      client.post(url(path), { ids: ['proof:1'] }).subscribe(); http.expectOne(url(path)).flush({ success: true });
    }
    client.post(`${environment.apiBaseUrl}-external/action`, {}).subscribe(); http.expectOne(`${environment.apiBaseUrl}-external/action`).flush({});
    client.post(url('/internal'), {}, { context: new HttpContext().set(ACTION_FEEDBACK, 'silent') }).subscribe();
    http.expectOne(url('/internal')).flush({});
    expect(feedback.notice()).toBeNull();
  });

  it('provides feedback when exporting reports, after the response arrives', () => {
    client.get(url('/admin/reports/payments/export'), { responseType: 'blob' }).subscribe();
    expect(feedback.notice()).toBeNull();
    http.expectOne(url('/admin/reports/payments/export')).flush(new Blob(['csv']));
    expect(feedback.notice()?.title).toBe('Report ready to download');
  });
});
