import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models';
import { BookingAddOn, BookingDraft } from '../models';
import { BookingCalculationService } from './booking-calculation.service';
import { PackageService } from './package.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

const EMPTY_DRAFT: BookingDraft = {
  eventType: null,
  eventDate: '',
  eventTime: '',
  venue: '',
  guestCount: 1,
  packageId: null,
  selectedAddOnIds: [],
  addOnQuantities: {},
  paymentMethod: null,
  specialRequest: '',
};

@Injectable({ providedIn: 'root' })
export class BookingDraftService {
  private readonly packageService = inject(PackageService);
  private readonly calculationService = inject(BookingCalculationService);
  private readonly http = inject(HttpClient);
  private readonly accountScope = inject(CustomerAccountScopeService);
  private readonly draftState = signal<BookingDraft>(EMPTY_DRAFT);
  private readonly submissionKeyState = signal(crypto.randomUUID());
  readonly submissionKey = this.submissionKeyState.asReadonly();

  readonly addOns = signal<readonly BookingAddOn[]>([]);
  readonly addOnsLoading = signal(false);
  readonly addOnsError = signal('');
  readonly addOnsLoaded = signal(false);
  readonly editingBookingId = signal<string | null>(null);
  readonly missingAddOnIds = computed(() => this.draftState().selectedAddOnIds.filter(id => !this.addOns().some(item => item.id === id)));
  readonly catalogSelectionError = computed(() => this.addOnsError()
    || (this.addOnsLoading() || !this.addOnsLoaded() ? 'Please wait for add-ons to load.' : '')
    || (this.missingAddOnIds().length ? 'Some selected add-ons are unavailable. Review them before saving.' : ''));

  constructor() {
    this.accountScope.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.reset();
      this.addOns.set([]);
      this.addOnsLoading.set(false);
      this.addOnsLoaded.set(false);
      this.addOnsError.set('');
    });
  }

  readonly draft = this.draftState.asReadonly();
  readonly unlockedStep = signal<1 | 2 | 3 | 4>(1);
  readonly selectedPackage = computed(() => {
    const packageId = this.draftState().packageId;
    return packageId ? this.packageService.getPackageById(packageId) : undefined;
  });
  readonly selectedAddOns = computed(() => {
    const selectedIds = new Set(this.draftState().selectedAddOnIds);
    return this.addOns().filter((addOn) => selectedIds.has(addOn.id)).map(addOn => {
      const quantity = this.supportsQuantity(addOn) ? this.addOnQuantity(addOn.id) : 1;
      return { ...addOn, unitPrice: addOn.price, quantity, price: Math.round(addOn.price * quantity * 100) / 100 };
    });
  });
  readonly pricing = computed(() => {
    const pkg = this.selectedPackage();
    return pkg
      ? this.calculationService.calculatePackagePricing(pkg, this.draftState().guestCount, this.selectedAddOns())
      : this.calculationService.calculatePricing(0, this.draftState().guestCount, this.selectedAddOns());
  });

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

  supportsQuantity(addOn: BookingAddOn): boolean {
    const name = addOn.name.trim().toLowerCase().replace(/[–—]/g, '-');
    return name === 'tiffany chair' || name === 'lechon (35-40 kg live weight)' || name === 'lechon (25-30 kg live weight)';
  }

  addOnQuantity(addOnId: string): number {
    return this.draftState().addOnQuantities?.[addOnId] ?? 1;
  }

  maxAddOnQuantity(addOn: BookingAddOn): number {
    return Math.min(2147483647, Math.floor(9999999999.99 / (addOn.price || 1)));
  }

  setAddOnQuantity(addOnId: string, quantity: number): void {
    const addOn = this.addOns().find(item => item.id === addOnId);
    if (!addOn || !this.supportsQuantity(addOn) || !this.draftState().selectedAddOnIds.includes(addOnId)
      || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > this.maxAddOnQuantity(addOn)) return;
    this.update({ addOnQuantities: { ...this.draftState().addOnQuantities, [addOnId]: quantity } });
  }

  removeUnavailableAddOns(): void {
    if (!this.addOnsLoaded() || this.addOnsLoading() || this.addOnsError()) return;
    const missing = new Set(this.missingAddOnIds());
    this.update({ selectedAddOnIds: this.draftState().selectedAddOnIds.filter(id => !missing.has(id)) });
  }

  loadAddOns(): void {
    const generation = this.accountScope.generation;
    this.addOnsLoading.set(true);
    this.addOnsError.set('');
    this.addOnsLoaded.set(false);
    this.http.get<ApiResponse<readonly BookingAddOn[]>>(`${environment.apiBaseUrl}/add-ons`).pipe(
      takeUntil(this.accountScope.changes),
      finalize(() => { if (generation === this.accountScope.generation) this.addOnsLoading.set(false); }),
    ).subscribe({
      next: response => {
        if (generation !== this.accountScope.generation) return;
        this.addOns.set(response.data.map(item => ({ ...item, id: String(item.id) })));
        this.addOnsLoaded.set(true);
      },
      error: () => { if (generation === this.accountScope.generation) this.addOnsError.set('Unable to load add-ons. Try again before saving.'); },
    });
  }

  reset(): void {
    this.submissionKeyState.set(crypto.randomUUID());
    this.editingBookingId.set(null);
    this.unlockedStep.set(1);
    this.draftState.set(EMPTY_DRAFT);
  }
}
