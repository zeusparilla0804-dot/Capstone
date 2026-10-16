import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, filter, finalize, map, of, startWith, switchMap } from 'rxjs';
import type { BookingAvailability, CustomEventRequestInput } from '../../core/models';
import { BookingService } from '../../core/services/booking.service';
import { CustomEventService } from '../../core/services/custom-event.service';
import { PackageService } from '../../core/services/package.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

type AvailabilityState = { phase: 'idle' | 'checking' } | { phase: 'ready'; data: BookingAvailability } | { phase: 'error'; message: string };
const draftKey = 'lachef.custom-event-draft';

@Component({
  selector: 'app-custom-event-page',
  imports: [PublicHeaderComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './custom-event.page.html',
  styleUrl: './custom-event.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CustomEventPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customEvents = inject(CustomEventService);
  private readonly bookings = inject(BookingService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly packages = inject(PackageService);
  protected readonly sourcePackageId = signal<number | null>(null);
  protected readonly sourcePackage = computed(() => this.packages.getPackageById(String(this.sourcePackageId() ?? '')));
  protected readonly availability = signal<AvailabilityState>({ phase: 'idle' });
  protected readonly availabilityData = computed(() => {
    const state = this.availability();
    return state.phase === 'ready' ? state.data : null;
  });
  protected readonly availabilityError = computed(() => {
    const state = this.availability();
    return state.phase === 'error' ? state.message : '';
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly minDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  protected readonly services = ['Complete buffet service', 'Event styling', 'Photo and video coverage', 'Host or entertainment', 'Grazing table', 'Coffee bar'];
  protected readonly eventTypes = ['Wedding', 'Birthday', 'Corporate', 'Debut', 'Anniversary', 'Other'];

  protected readonly form = new FormGroup({
    eventType: new FormControl('', { nonNullable: true, validators: Validators.required }),
    eventDate: new FormControl('', { nonNullable: true, validators: Validators.required }),
    eventTime: new FormControl('', { nonNullable: true, validators: Validators.required }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
    guestCount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(10_000)] }),
    targetBudget: new FormControl<number | null>(null, { validators: [Validators.min(0), Validators.max(99_999_999.99)] }),
    menuPreferences: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
    dietaryNotes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
    setupPreferences: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
    requestedServices: new FormControl<readonly string[]>([], { nonNullable: true }),
    specialRequest: new FormControl('', { nonNullable: true, validators: Validators.maxLength(2_000) }),
  });

  constructor() {
    this.packages.load();
    const source = Number(this.route.snapshot.queryParamMap.get('sourcePackage'));
    if (Number.isSafeInteger(source) && source > 0) this.sourcePackageId.set(source);
    this.restoreDraft();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      try { localStorage.setItem(draftKey, JSON.stringify(value)); } catch { /* Draft storage is best effort. */ }
    });
    this.watchAvailability();
  }

  protected toggleService(service: string, checked: boolean): void {
    const current = this.form.controls.requestedServices.value;
    this.form.controls.requestedServices.setValue(checked ? [...current, service] : current.filter(item => item !== service));
  }

  protected serviceSelected(service: string): boolean {
    return this.form.controls.requestedServices.value.includes(service);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) { this.form.markAllAsTouched(); return; }
    const availability = this.availability();
    if (availability.phase !== 'ready' || availability.data.status === 'FULL') {
      this.error.set('Confirm an available date before submitting your request.'); return;
    }
    const value = this.form.getRawValue();
    this.submitting.set(true); this.error.set('');
    const optional = (text: string) => text.trim() || undefined;
    const input: CustomEventRequestInput = {
      eventType: value.eventType, eventDate: value.eventDate, eventTime: value.eventTime,
      venue: value.venue.trim(), guestCount: value.guestCount!, requestedServices: value.requestedServices,
      ...(this.sourcePackageId() ? { sourcePackageId: this.sourcePackageId()! } : {}),
      ...(value.targetBudget !== null ? { targetBudget: value.targetBudget } : {}),
      ...(optional(value.menuPreferences) ? { menuPreferences: optional(value.menuPreferences) } : {}),
      ...(optional(value.dietaryNotes) ? { dietaryNotes: optional(value.dietaryNotes) } : {}),
      ...(optional(value.setupPreferences) ? { setupPreferences: optional(value.setupPreferences) } : {}),
      ...(optional(value.specialRequest) ? { specialRequest: optional(value.specialRequest) } : {}),
    };
    try {
      const result = await this.customEvents.submit(input);
      try { localStorage.removeItem(draftKey); } catch { /* Draft storage is best effort. */ }
      await this.router.navigate(['/custom-events', result.id]);
    } catch (error: unknown) {
      const apiMessage = typeof error === 'object' && error !== null && 'error' in error
        ? (error as { error?: { message?: string } }).error?.message : undefined;
      this.error.set(apiMessage ?? 'We could not submit your custom event request. Please try again.');
    } finally { this.submitting.set(false); }
  }

  private watchAvailability(): void {
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()), debounceTime(300),
      map(value => ({ date: value.eventDate ?? '', guests: Number(value.guestCount) })),
      distinctUntilChanged((a, b) => a.date === b.date && a.guests === b.guests),
      filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value.date) && Number.isInteger(value.guests) && value.guests > 0),
      switchMap(value => {
        this.availability.set({ phase: 'checking' });
        return this.bookings.checkAvailability(value.date, value.guests).pipe(
          map(data => ({ phase: 'ready' as const, data })),
          catchError(() => of({ phase: 'error' as const, message: 'Date availability is temporarily unavailable.' })),
        );
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(state => this.availability.set(state));
  }

  private restoreDraft(): void {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) this.form.patchValue(JSON.parse(raw) as object);
    } catch { /* Ignore corrupt or unavailable local storage. */ }
  }
}
