import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { AdminPackage, AdminPackageInput, EventTypeOption, PackagePricingType } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';

@Component({
  selector: 'app-admin-packages',
  imports: [AdminShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-packages.page.html',
  styleUrl: './admin-packages.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AdminPackagesPage {
  private readonly api = inject(AdminService);
  protected readonly items = signal<readonly AdminPackage[]>([]);
  protected readonly events = signal<readonly EventTypeOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly formError = signal('');
  protected readonly message = signal('');
  protected readonly editing = signal<number | null>(null);
  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    eventId: new FormControl(0, { nonNullable: true, validators: Validators.min(1) }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    description: new FormControl('', { nonNullable: true, validators: Validators.maxLength(1_000) }),
    pricingType: new FormControl<PackagePricingType>('PER_HEAD', { nonNullable: true }),
    pricePerGuest: new FormControl<number | null>(0),
    basePrice: new FormControl<number | null>(null),
    includedGuests: new FormControl<number | null>(null),
    excessGuestPrice: new FormControl<number | null>(null),
    minGuests: new FormControl<number | null>(null, Validators.min(1)),
    maxGuests: new FormControl<number | null>(null, Validators.min(1)),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  constructor() {
    this.form.controls.pricingType.valueChanges.subscribe(type => this.configurePricing(type, true));
    this.configurePricing('PER_HEAD', false);
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({ items: this.api.packages(), events: this.api.eventTypes() }).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: response => {
        this.items.set(response.items.data);
        this.events.set(response.events.data);
      },
      error: () => this.loadError.set('Unable to load packages.'),
    });
  }

  protected create(): void {
    this.editing.set(null);
    this.formError.set('');
    this.message.set('');
    this.form.reset({
      eventId: 0, name: '', description: '', pricingType: 'PER_HEAD', pricePerGuest: 0,
      basePrice: null, includedGuests: null, excessGuestPrice: null,
      minGuests: null, maxGuests: null, isActive: true,
    });
    this.configurePricing('PER_HEAD', false);
    this.showForm.set(true);
  }

  protected edit(item: AdminPackage): void {
    this.editing.set(item.id);
    this.formError.set('');
    this.message.set('');
    this.form.setValue({
      eventId: item.eventId, name: item.name, description: item.description,
      pricingType: item.pricingType, pricePerGuest: item.pricePerGuest,
      basePrice: item.basePrice, includedGuests: item.includedGuests,
      excessGuestPrice: item.excessGuestPrice, minGuests: item.minGuests,
      maxGuests: item.maxGuests, isActive: item.isActive,
    });
    this.configurePricing(item.pricingType, false);
    this.showForm.set(true);
  }

  protected closeForm(): void {
    if (this.saving()) return;
    this.showForm.set(false);
    this.formError.set('');
  }

  protected save(): void {
    this.formError.set('');
    if (!this.guestBoundsAreValid()) {
      this.formError.set('Maximum guests must be greater than or equal to minimum guests.');
      return;
    }
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const editingId = this.editing();
    this.saving.set(true);
    this.api.savePackage(this.packageInput(), editingId ?? undefined).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => {
        this.message.set(editingId ? 'Package updated.' : 'Package created.');
        this.showForm.set(false);
        this.load();
      },
      error: error => this.formError.set(this.errorMessage(error)),
    });
  }

  protected toggle(item: AdminPackage): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.api.savePackage({ ...this.inputFromItem(item), isActive: !item.isActive }, item.id).pipe(
      finalize(() => this.saving.set(false)),
    ).subscribe({ next: () => this.load(), error: error => this.loadError.set(this.errorMessage(error)) });
  }

  protected pricingSummary(item: AdminPackage): string {
    if (item.pricingType === 'BASE_PLUS_EXCESS') {
      return `PHP ${this.amount(item.basePrice)} includes ${item.includedGuests} guests + PHP ${this.amount(item.excessGuestPrice)} each additional guest`;
    }
    return `PHP ${this.amount(item.pricePerGuest)} per guest`;
  }

  protected guestRange(item: AdminPackage): string {
    if (item.minGuests !== null && item.maxGuests !== null) return `${item.minGuests}-${item.maxGuests}`;
    if (item.minGuests !== null) return `${item.minGuests}+`;
    if (item.maxGuests !== null) return `Up to ${item.maxGuests}`;
    return 'Not set';
  }

  private configurePricing(type: PackagePricingType, clearHidden: boolean): void {
    const perHead = this.form.controls.pricePerGuest;
    const baseControls = [this.form.controls.basePrice, this.form.controls.includedGuests, this.form.controls.excessGuestPrice];
    if (type === 'PER_HEAD') {
      perHead.setValidators([Validators.required, Validators.min(.01)]);
      for (const control of baseControls) {
        control.clearValidators();
        if (clearHidden) control.setValue(null, { emitEvent: false });
        control.updateValueAndValidity({ emitEvent: false });
      }
    } else {
      perHead.clearValidators();
      if (clearHidden) perHead.setValue(null, { emitEvent: false });
      perHead.updateValueAndValidity({ emitEvent: false });
      this.form.controls.basePrice.setValidators([Validators.required, Validators.min(.01)]);
      this.form.controls.includedGuests.setValidators([Validators.required, Validators.min(1)]);
      this.form.controls.excessGuestPrice.setValidators([Validators.required, Validators.min(.01)]);
      for (const control of baseControls) control.updateValueAndValidity({ emitEvent: false });
    }
    perHead.updateValueAndValidity({ emitEvent: false });
  }

  private guestBoundsAreValid(): boolean {
    const { minGuests, maxGuests } = this.form.getRawValue();
    return minGuests === null || maxGuests === null || minGuests <= maxGuests;
  }

  private packageInput(): AdminPackageInput {
    const value = this.form.getRawValue();
    const common = { eventId: value.eventId, name: value.name.trim(), description: value.description.trim(),
      minGuests: value.minGuests, maxGuests: value.maxGuests, isActive: value.isActive };
    return value.pricingType === 'PER_HEAD'
      ? { ...common, pricingType: 'PER_HEAD', pricePerGuest: value.pricePerGuest!, basePrice: null, includedGuests: null, excessGuestPrice: null }
      : { ...common, pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: value.basePrice!, includedGuests: value.includedGuests!, excessGuestPrice: value.excessGuestPrice! };
  }

  private inputFromItem(item: AdminPackage): AdminPackageInput {
    const { id: _id, eventType: _eventType, ...input } = item;
    return input;
  }

  private amount(value: number): string {
    return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(value);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) return 'Cannot connect to LA Chef. Please try again.';
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') return error.error.message;
    return 'Unable to save package. Please try again.';
  }
}
