import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, filter, firstValueFrom, finalize, map, Observable, of, takeUntil, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Booking, BookingAvailability, BookingDraft, BookingPackageSummary, BookingStatus, BookingTab, CateringPackage } from '../models';
import { CustomerAccountScopeService } from './customer-account-scope.service';

interface ApiBooking extends Omit<Booking, 'id' | 'customerId' | 'thumbnailUrl' | 'package' | 'addOns'> {
  readonly id: number;
  readonly total: number;
  readonly package: Omit<BookingPackageSummary, 'packageId'> & { readonly packageId: number };
  readonly addOns: readonly { id: number; name: string; description?: string; price: number; quantity?: number; unitPrice?: number }[];
}
const tabByStatus: Record<BookingStatus, BookingTab> = {
  pending: 'upcoming', approved: 'upcoming', awaiting_payment: 'upcoming', payment_submitted: 'upcoming',
  payment_verified: 'upcoming', confirmed: 'upcoming', completed: 'past', rejected: 'rejected', cancelled: 'cancelled', expired: 'cancelled',
};

export class BookingSubmissionConflictError extends Error {
  constructor() {
    super('This request may already have been received. Review your reservations before starting a new request, or restore the details you first submitted to retry safely.');
  }
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly accountScope = inject(CustomerAccountScopeService);
  private readonly state = signal<readonly Booking[]>([]);
  private submissionAttempt: { key: string; fingerprint: string } | null = null;
  readonly bookings = this.state.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    this.accountScope.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.submissionAttempt = null;
      this.state.set([]);
      this.loading.set(false);
      this.error.set('');
    });
  }

  private scoped<T>(source: Observable<T>): Observable<T> {
    const generation = this.accountScope.generation;
    return source.pipe(takeUntil(this.accountScope.changes), filter(() => generation === this.accountScope.generation));
  }

  loadMine(): void {
    const generation = this.accountScope.generation;
    this.loading.set(true);
    this.error.set('');
    this.scoped(this.http.get<ApiResponse<readonly ApiBooking[]>>(`${environment.apiBaseUrl}/bookings/my`, { withCredentials: true })).pipe(
      finalize(() => { if (generation === this.accountScope.generation) this.loading.set(false); }),
    ).subscribe({
      next: response => this.state.set(response.data.map(item => this.map(item))),
      error: () => {
        if (generation !== this.accountScope.generation) return;
        this.state.set([]);
        this.error.set('Unable to load your bookings.');
      },
    });
  }

  getBookingById(id: string) { return this.state().find(item => item.id === id); }

  loadBookingById(id: string): Observable<Booking> {
    return defer(() => {
      const cached = this.getBookingById(id);
      if (cached) return of(cached);
      return this.scoped(this.http.get<ApiResponse<ApiBooking>>(`${environment.apiBaseUrl}/bookings/${id}`, { withCredentials: true })).pipe(
        map(response => this.map(response.data)), tap(booking => this.storeBooking(booking)),
      );
    });
  }

  getBookingsByTab(tab: BookingTab) {
    return [...this.state().filter(item => tabByStatus[item.status] === tab)]
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate) * (tab === 'upcoming' ? 1 : -1));
  }

  checkAvailability(date: string, guestCount: number, reservationId?: string) {
    const params: Record<string, string> = { date, guestCount: String(guestCount) };
    if (reservationId) params['reservationId'] = reservationId;
    return this.scoped(this.http.get<ApiResponse<BookingAvailability>>(`${environment.apiBaseUrl}/bookings/availability`, { params, withCredentials: true }))
      .pipe(map(response => response.data));
  }

  async cancelBooking(id: string, reason: string): Promise<boolean> {
    const generation = this.accountScope.generation;
    try {
      await firstValueFrom(this.scoped(this.http.patch<void>(`${environment.apiBaseUrl}/bookings/${id}/cancel`, { reason: reason.trim() }, { withCredentials: true })));
      if (generation !== this.accountScope.generation) return false;
      this.state.update(items => items.map(item => item.id === id ? { ...item, status: 'cancelled' as const, cancelledAt: new Date().toISOString() } : item));
      return true;
    } catch { return false; }
  }

  async submitDraft(draft: BookingDraft, pkg: CateringPackage, addOns: Booking['addOns'], submissionKey: string): Promise<string> {
    const generation = this.accountScope.generation;
    const payload = this.payload(draft, pkg, addOns);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionKey)) {
      throw new Error('The booking submission identifier is invalid. Reopen your booking before continuing.');
    }
    const key = submissionKey.toLowerCase();
    const fingerprint = JSON.stringify({
      ...payload, eventType: payload.eventType?.trim(), eventDate: payload.eventDate?.trim(),
      eventTime: payload.eventTime?.trim(), venue: payload.venue?.trim(),
      specialRequest: payload.specialRequest?.trim() || null,
      addOnIds: [...payload.addOnIds].sort((a, b) => a - b),
      addOnQuantities: Object.fromEntries([...payload.addOnIds].sort((a, b) => a - b)
        .map(id => [String(id), payload.addOnQuantities[String(id)] ?? 1])),
    });
    if (this.submissionAttempt?.key === key && this.submissionAttempt.fingerprint !== fingerprint) {
      throw new BookingSubmissionConflictError();
    }
    const attempt = { key, fingerprint };
    this.submissionAttempt = attempt;
    try {
      const response = await firstValueFrom(this.scoped(this.http.post<ApiResponse<ApiBooking>>(`${environment.apiBaseUrl}/bookings`, payload, {
        withCredentials: true, headers: { 'Idempotency-Key': key },
      })));
      this.assertCurrentGeneration(generation);
      this.storeBooking(this.map(response.data));
      return response.data.reference;
    } catch (error) {
      // A definitive rejection did not commit a reservation. Uncertain outcomes retain
      // the original details so an edit cannot turn a retry into a duplicate request.
      if (this.submissionAttempt === attempt && error instanceof HttpErrorResponse
        && error.status >= 400 && error.status < 500 && error.error?.code !== 'BOOKING_SUBMISSION_CONFLICT') {
        this.submissionAttempt = null;
      }
      throw error;
    }
  }

  async updatePendingBooking(id: string, draft: BookingDraft, pkg: CateringPackage, addOns: Booking['addOns']): Promise<Booking> {
    const generation = this.accountScope.generation;
    const response = await firstValueFrom(this.scoped(this.http.patch<ApiResponse<ApiBooking>>(`${environment.apiBaseUrl}/bookings/${id}/details`, this.payload(draft, pkg, addOns), { withCredentials: true })));
    this.assertCurrentGeneration(generation);
    const booking = this.map(response.data);
    this.storeBooking(booking);
    return booking;
  }

  private assertCurrentGeneration(generation: number): void {
    if (generation !== this.accountScope.generation) throw new Error('Your account changed. Reopen your booking before continuing.');
  }

  private payload(draft: BookingDraft, pkg: CateringPackage, addOns: Booking['addOns']) {
    if (draft.selectedAddOnIds.length !== addOns.length || draft.selectedAddOnIds.some(id => !addOns.some(item => item.id === id))) {
      throw new Error('Selected add-ons are unavailable. Review them before saving.');
    }
    return {
      eventType: draft.eventType, eventDate: draft.eventDate, eventTime: this.time(draft.eventTime), venue: draft.venue,
      guestCount: draft.guestCount, packageId: Number(pkg.id), addOnIds: addOns.map(item => Number(item.id)),
      addOnQuantities: Object.fromEntries(addOns.map(item => [item.id, item.quantity ?? 1])),
      paymentMethod: draft.paymentMethod === 'gcash' ? 'e-wallet' : draft.paymentMethod, specialRequest: draft.specialRequest,
    };
  }

  private storeBooking(booking: Booking): void {
    this.state.update(items => items.some(item => item.id === booking.id)
      ? items.map(item => item.id === booking.id ? booking : item) : [booking, ...items]);
  }

  private map(item: ApiBooking): Booking {
    return { ...item, id: String(item.id), customerId: '', package: { ...item.package, packageId: String(item.package.packageId) },
      addOns: item.addOns.map(addOn => ({ ...addOn, id: String(addOn.id) })),
      thumbnailUrl: `assets/images/packages/${item.eventType === 'wedding' ? 'premium' : item.eventType === 'debut' ? 'deluxe' : 'basic'}-package.webp` };
  }

  private time(value: string): string {
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return value;
    let hour = Number(match[1]);
    if (match[3]!.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (match[3]!.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${match[2]}`;
  }
}
