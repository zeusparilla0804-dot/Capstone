import { HttpClient, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiResponse, PaymentProof, PaymentProofSubmission, PaymentProofStatus } from '../models';

type ApiProof = Omit<PaymentProof, 'id' | 'status'> & { readonly id: string | number; readonly status: string };

@Injectable({ providedIn: 'root' })
export class PaymentProofService {
  private readonly http = inject(HttpClient);

  listProofs(bookingId: string): Observable<readonly PaymentProof[]> {
    return this.http.get<ApiResponse<readonly ApiProof[]>>(
      `${environment.apiBaseUrl}/bookings/${bookingId}/payment-proofs`,
      { withCredentials: true },
    ).pipe(map(response => response.data.map(proof => this.mapProof(proof))));
  }

  submitProof(bookingId: string, input: PaymentProofSubmission, file: File): Observable<HttpEvent<ApiResponse<PaymentProof>>> {
    if (input.method === 'E_WALLET') return throwError(() => new Error('LA Chef accepts cash and bank transfer only.'));
    const body = new FormData();
    body.set('method', input.method);
    body.set('claimedAmount', String(input.claimedAmount));
    if (input.transactionReference) body.set('transactionReference', input.transactionReference);
    body.set('paymentDate', input.paymentDate);
    if (input.destinationId !== undefined) body.set('destinationId', String(input.destinationId));
    if (input.destinationVersion) body.set('destinationVersion', input.destinationVersion);
    if (input.replacesProofId) body.set('replacesProofId', input.replacesProofId);
    body.set('proof', file, file.name);
    return this.http.post<ApiResponse<ApiProof>>(
      `${environment.apiBaseUrl}/bookings/${bookingId}/payment-proofs`, body,
      { observe: 'events', reportProgress: true, withCredentials: true },
    ).pipe(map(event => {
      if (event.type !== HttpEventType.Response) return event;
      const response = event as HttpResponse<ApiResponse<ApiProof>>;
      return response.clone({ body: { ...response.body!, data: this.mapProof(response.body!.data) } });
    }));
  }

  private mapProof(proof: ApiProof): PaymentProof {
    return { ...proof, id: String(proof.id), status: proof.status.toLowerCase() as PaymentProofStatus };
  }
}
