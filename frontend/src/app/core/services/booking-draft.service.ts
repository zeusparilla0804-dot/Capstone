import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models';
import { BookingAddOn, BookingDraft } from '../models';
import { BookingCalculationService } from './booking-calculation.service';
import { PackageService } from './package.service';

const EMPTY_DRAFT: BookingDraft = {
  eventType: null,
  eventDate: '',
  eventTime: '',
  venue: '',
  guestCount: 1,
  packageId: null,
  selectedAddOnIds: [],
  paymentMethod: null,
};

@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private readonly packageService = inject(PackageService);
  private readonly calculationService = inject(BookingCalculationService);
  private readonly http = inject(HttpClient);
  private readonly draftState = signal<BookingDraft>(EMPTY_DRAFT);

  readonly addOns = signal<readonly BookingAddOn[]>([]);
  readonly addOnsLoading = signal(false);
  readonly addOnsError = signal('');

  readonly draft = this.draftState.asReadonly();
  readonly selectedPackage = computed(() => {
    const packageId = this.draftState().packageId;
    return packageId ? this.packageService.getPackageById(packageId) : undefined;
  });
  readonly selectedAddOns = computed(() => {
    const selectedIds = new Set(this.draftState().selectedAddOnIds);
    return this.addOns().filter((addOn) => selectedIds.has(addOn.id));
  });
  readonly pricing = computed(() => this.calculationService.calculatePricing(
    this.selectedPackage()?.pricePerGuest ?? 0,
    this.draftState().guestCount,
    this.selectedAddOns(),
  ));

  update(values: Partial<BookingDraft>): void {
    this.draftState.update((draft) => ({ ...draft, ...values }));
  }

  selectPackage(packageId: string | null): void {
    this.update({ packageId: packageId || null });
  }

  toggleAddOn(addOnId: string): void {
    const selected = this.draftState().selectedAddOnIds;
    this.update({ selectedAddOnIds: selected.includes(addOnId) ? selected.filter((id) => id !== addOnId) : [...selected, addOnId] });
  }

  loadAddOns(): void { this.addOnsLoading.set(true); this.addOnsError.set(''); this.http.get<ApiResponse<readonly BookingAddOn[]>>(`${environment.apiBaseUrl}/add-ons`).pipe(finalize(()=>this.addOnsLoading.set(false))).subscribe({next:r=>this.addOns.set(r.data.map(item=>({...item,id:String(item.id)}))),error:()=>this.addOnsError.set('Unable to load add-ons.')}); }

  reset(): void {
    this.draftState.set(EMPTY_DRAFT);
  }
}
