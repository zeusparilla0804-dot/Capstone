import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { BookingDraftService } from './booking-draft.service';
import { PackageService } from './package.service';
import { CustomerAccountScopeService } from './customer-account-scope.service';

describe('BookingDraftService add-on quantities', () => {
  it('replaces a photobooth choice without removing other services or double charging', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(BookingDraftService);
    service.addOns.set([
      { id: 'basic', name: 'Basic Photobooth (2 Hours Unlimited)', price: 4000 },
      { id: 'mirror', name: 'Mirror Photobooth (2 Hours Unlimited)', price: 10000 },
      { id: 'host', name: 'Professional Host', price: 8000 },
    ]);
    service.toggleAddOn('host');
    service.toggleAddOn('basic');
    service.toggleAddOn('mirror');
    expect(service.draft().selectedAddOnIds).toEqual(['host', 'mirror']);
    expect(service.pricing().addOnTotal).toBe(18000);
    service.toggleAddOn('mirror');
    expect(service.pricing().addOnTotal).toBe(8000);
  });
  it('shows only add-ons allowed for the selected event and blocks incompatible selections', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(BookingDraftService);
    service.addOns.set([
      { id: '1', name: 'Host or Magician', price: 7000, eventTypes: ['birthday', 'debut'] },
      { id: '2', name: 'Coffee Bar for 100 Guests', price: 22000, eventTypes: ['wedding', 'birthday', 'corporate', 'debut', 'anniversary', 'other'] },
    ]);
    service.update({ eventType: 'wedding' });
    expect(service.availableAddOns().map(item => item.id)).toEqual(['2']);
    service.toggleAddOn('1');
    expect(service.draft().selectedAddOnIds).toEqual([]);
  });
  it('defaults a 100-guest coffee bar to five units for 500 guests and updates its total', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(BookingDraftService);
    service.addOns.set([{ id: '5', name: 'Coffee Bar for 100 Guests', price: 22_000 }]);
    service.update({ guestCount: 500 });
    service.toggleAddOn('5');
    expect(service.addOnQuantity('5')).toBe(5);
    expect(service.pricing().addOnTotal).toBe(110_000);
    service.setAddOnQuantity('5', 6);
    expect(service.pricing().addOnTotal).toBe(132_000);
  });
  it('preserves quantities when toggled and applies only selected quantities to pricing', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), {
      provide: PackageService, useValue: { getPackageById: () => undefined, packages: signal([]) },
    }] });
    const service = TestBed.inject(BookingDraftService);
    service.addOns.set([
      { id: '1', name: 'Tiffany Chair', price: 100 },
      { id: '2', name: 'Lechon (35-40 kg Live Weight)', price: 14000 },
      { id: '3', name: 'Coffee Bar', price: 4000 },
      { id: '4', name: 'Lechon (25-30 kg Live Weight)', price: 12500 },
    ]);
    service.toggleAddOn('1');
    expect(service.addOnQuantity('1')).toBe(1);
    service.setAddOnQuantity('1', 12);
    service.toggleAddOn('2');
    service.setAddOnQuantity('2', 2);
    expect(service.pricing().addOnTotal).toBe(29200);
    expect(service.pricing().downPayment).toBe(14600);
    service.toggleAddOn('1');
    expect(service.pricing().addOnTotal).toBe(28000);
    service.toggleAddOn('1');
    expect(service.addOnQuantity('1')).toBe(12);
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) service.setAddOnQuantity('1', invalid);
    expect(service.addOnQuantity('1')).toBe(12);
    service.toggleAddOn('3');
    service.setAddOnQuantity('3', 4);
    expect(service.addOnQuantity('3')).toBe(1);
    expect(service.pricing().addOnTotal).toBe(33200);
    service.toggleAddOn('4');
    expect(service.addOnQuantity('4')).toBe(1);
    service.setAddOnQuantity('4', 2);
    expect(service.pricing().addOnTotal).toBe(58200);
    expect(service.pricing().downPayment).toBe(29100);
    service.toggleAddOn('4');
    expect(service.pricing().addOnTotal).toBe(33200);
    service.toggleAddOn('4');
    expect(service.addOnQuantity('4')).toBe(2);
    service.reset();
    expect(service.addOnQuantity('1')).toBe(1);
    expect(service.pricing().addOnTotal).toBe(0);
  });
});

describe('BookingDraftService package selection', () => {
  it('keeps one submission UUID across draft edits and rotates it on reset and account changes', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const draft = TestBed.inject(BookingDraftService) as any;
    const initial = draft.submissionKey?.();
    expect(initial).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    draft.update({ venue: 'Updated venue' });
    expect(draft.submissionKey()).toBe(initial);
    draft.reset();
    const fresh = draft.submissionKey();
    expect(fresh).not.toBe(initial);
    TestBed.inject(CustomerAccountScopeService).setPrincipal('Another customer');
    expect(draft.submissionKey()).not.toBe(fresh);
  });
  it('clears event details and edit identity synchronously when the customer changes', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const scope = TestBed.inject(CustomerAccountScopeService);
    scope.setPrincipal('A');
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.update({ venue: 'Private venue', selectedAddOnIds: ['5'] });
    draft.editingBookingId?.set('27');
    scope.setPrincipal('B');
    expect(draft.draft().venue).toBe('');
    expect(draft.draft().selectedAddOnIds).toEqual([]);
    expect(draft.editingBookingId()).toBeNull();
  });

  it('requires explicit removal of saved add-ons missing from the loaded catalog', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const draft = TestBed.inject(BookingDraftService) as any;
    draft.update({ selectedAddOnIds: ['5'] });
    draft.loadAddOns();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiBaseUrl}/add-ons`).flush({ success: true, data: [] });
    expect(draft.catalogSelectionError()).toContain('unavailable');
    expect(draft.draft().selectedAddOnIds).toEqual(['5']);
    draft.removeUnavailableAddOns();
    expect(draft.draft().selectedAddOnIds).toEqual([]);
    expect(draft.catalogSelectionError()).toBe('');
  });
  it('preserves a package selected before the catalog request completes', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const draft = TestBed.inject(BookingDraftService);
    const packages = TestBed.inject(PackageService);
    const http = TestBed.inject(HttpTestingController);

    draft.selectPackage('13');
    expect(draft.draft().packageId).toBe('13');
    expect(draft.selectedPackage()).toBeUndefined();

    packages.load();
    http.expectOne(`${environment.apiBaseUrl}/packages`).flush({
      success: true,
      data: [
        {
          id: 13,
          name: 'Custom Celebration',
          category: 'other',
          description: 'A tailored event.',
          pricePerGuest: 850,
          minGuests: 20,
          maxGuests: 100,
          features: [],
        },
      ],
    });

    expect(draft.selectedPackage()?.id).toBe('13');
    http.verify();
  });
});
