import { HttpEventType } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { PaymentProofService } from './payment-proof.service';

describe('PaymentProofService', () => {
  let service: PaymentProofService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentProofService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('blocks GCash uploads while retaining the method on old proof history', async () => {
    let error = '';
    service.submitProof('42', { method: 'E_WALLET', claimedAmount: 100, paymentDate: '2026-10-02' },
      new File(['old'], 'old.png', { type: 'image/png' })).subscribe({ error: value => { error = value.message; } });
    expect(error).toMatch(/cash.*bank transfer/i);
    http.expectNone(`${environment.apiBaseUrl}/bookings/42/payment-proofs`);
    let recorded: unknown;
    service.listProofs('42').subscribe(value => { recorded = value[0]; });
    http.expectOne(`${environment.apiBaseUrl}/bookings/42/payment-proofs`).flush({ data: [{ id: 1, method: 'E_WALLET', claimedAmount: 100, status: 'VERIFIED' }] });
    expect(recorded).toMatchObject({ method: 'E_WALLET', claimedAmount: 100, status: 'verified' });
  });

  it('sends the exact multipart fields and enables upload progress', () => {
    const file = new File(['proof'], 'bank.png', { type: 'image/png' });
    const events: number[] = [];
    service.submitProof('42', {
      method: 'BANK_TRANSFER', claimedAmount: 1250.5, transactionReference: 'BANK-42', paymentDate: '2026-10-02',
      destinationId: 2, destinationVersion: 'b'.repeat(64),
    }, file).subscribe(event => events.push(event.type));

    const request = http.expectOne(`${environment.apiBaseUrl}/bookings/42/payment-proofs`);
    expect(request.request.method).toBe('POST');
    expect(request.request.reportProgress).toBe(true);
    const body = request.request.body as FormData;
    expect(body.get('method')).toBe('BANK_TRANSFER');
    expect(body.get('claimedAmount')).toBe('1250.5');
    expect(body.get('transactionReference')).toBe('BANK-42');
    expect(body.get('paymentDate')).toBe('2026-10-02');
    expect(body.get('destinationId')).toBe('2');
    expect(body.get('destinationVersion')).toBe('b'.repeat(64));
    const uploaded = body.get('proof') as File;
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded.name).toBe('bank.png');
    expect(uploaded.type).toBe('image/png');
    expect(uploaded.size).toBe(file.size);
    request.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 5 });
    request.flush({ success: true, data: { id: 1, reservationId: 42, customerId: 7, method: 'BANK_TRANSFER',
      claimedAmount: 1250.5, transactionReference: 'BANK-42', paymentDate: '2026-10-02', originalFilename: 'bank.png',
      mimeType: 'image/png', byteSize: 5, status: 'SUBMITTED', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' } });
    expect(events).toContain(HttpEventType.UploadProgress);
    expect(events).toContain(HttpEventType.Response);
  });

  it('omits the optional reference for cash and maps proof history safely', () => {
    const file = new File(['proof'], 'cash.webp', { type: 'image/webp' });
    service.submitProof('8', { method: 'CASH', claimedAmount: 500, paymentDate: '2026-10-02' }, file).subscribe();
    const submission = http.expectOne(`${environment.apiBaseUrl}/bookings/8/payment-proofs`);
    expect((submission.request.body as FormData).has('transactionReference')).toBe(false);
    submission.flush({ success: true, data: { id: 2, reservationId: 8, customerId: 7, method: 'CASH', claimedAmount: 500,
      paymentDate: '2026-10-02', originalFilename: 'cash.webp', mimeType: 'image/webp', byteSize: 5, status: 'SUBMITTED',
      createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' } });

    let status = '';
    service.listProofs('8').subscribe(proofs => { status = proofs[0]!.status; });
    http.expectOne(`${environment.apiBaseUrl}/bookings/8/payment-proofs`).flush({ success: true, data: [{ id: 2,
      reservationId: 8, customerId: 7, method: 'CASH', claimedAmount: 500, paymentDate: '2026-10-02',
      originalFilename: 'cash.webp', mimeType: 'image/webp', byteSize: 5, status: 'SUBMITTED',
      createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }] });
    expect(status).toBe('submitted');
  });
});
