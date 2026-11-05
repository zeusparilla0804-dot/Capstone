import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminPackage } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminPackagesPage } from './admin-packages.page';

const perHead: AdminPackage = {
  id: 1, eventId: 1, eventType: 'Standard Catering', name: 'PHP 480', description: 'Standard tier',
  pricingType: 'PER_HEAD', pricePerGuest: 480, basePrice: null, includedGuests: null,
  excessGuestPrice: null, minGuests: null, maxGuests: null, isActive: true,
};
const basePackage: AdminPackage = {
  id: 2, eventId: 2, eventType: 'Debut', name: 'Amethyst', description: 'Debut package',
  pricingType: 'BASE_PLUS_EXCESS', pricePerGuest: null, basePrice: 85_888, includedGuests: 50,
  excessGuestPrice: 650, minGuests: null, maxGuests: null, isActive: true,
};

describe('AdminPackagesPage pricing editor', () => {
  let api: {
    packages: ReturnType<typeof vi.fn>;
    eventTypes: ReturnType<typeof vi.fn>;
    savePackage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      packages: vi.fn(() => of({ success: true, data: [perHead, basePackage] })),
      eventTypes: vi.fn(() => of({ success: true, data: [{ id: 1, name: 'Standard Catering' }, { id: 2, name: 'Debut' }] })),
      savePackage: vi.fn(() => of({ success: true })),
    };
    TestBed.configureTestingModule({
      imports: [AdminPackagesPage],
      providers: [provideRouter([]), { provide: AdminService, useFactory: () => api }],
    });
  });

  it('switches pricing fields and clears hidden stale values', () => {
    const component = TestBed.createComponent(AdminPackagesPage).componentInstance as any;
    component.create();
    component.form.controls.pricePerGuest.setValue(480);

    component.form.controls.pricingType.setValue('BASE_PLUS_EXCESS');
    expect(component.form.controls.pricePerGuest.value).toBeNull();
    expect(component.form.controls.basePrice.hasValidator).toBeDefined();

    component.form.controls.basePrice.setValue(85_888);
    component.form.controls.includedGuests.setValue(50);
    component.form.controls.excessGuestPrice.setValue(650);
    component.form.controls.pricingType.setValue('PER_HEAD');
    expect(component.form.controls.basePrice.value).toBeNull();
    expect(component.form.controls.includedGuests.value).toBeNull();
    expect(component.form.controls.excessGuestPrice.value).toBeNull();
  });

  it('keeps the create opener out of an active editor and restores it after cancel', () => {
    const fixture = TestBed.createComponent(AdminPackagesPage);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[admin-actions]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.package-editor button[type="submit"]')).not.toBeNull();

    fixture.nativeElement.querySelector('.form-actions button[type="button"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.package-editor')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).not.toBeNull();

    fixture.nativeElement.querySelector('.row-actions button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[formControlName="name"]').value).toBe('PHP 480');
  });

  it('accepts optional guest bounds and submits only the active pricing model', () => {
    const component = TestBed.createComponent(AdminPackagesPage).componentInstance as any;
    component.create();
    component.form.patchValue({ eventId: 1, name: 'PHP 580', description: 'Standard tier',
      pricingType: 'PER_HEAD', pricePerGuest: 580, minGuests: null, maxGuests: null });

    component.save();

    expect(api.savePackage).toHaveBeenCalledWith({
      eventId: 1, name: 'PHP 580', description: 'Standard tier', pricingType: 'PER_HEAD',
      pricePerGuest: 580, basePrice: null, includedGuests: null, excessGuestPrice: null,
      minGuests: null, maxGuests: null, isActive: true,
    }, undefined);
  });

  it('renders readable pricing summaries for both models without invented guest limits', () => {
    const fixture = TestBed.createComponent(AdminPackagesPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('PHP 480 per guest');
    expect(text).toContain('PHP 85,888 includes 50 guests + PHP 650 each additional guest');
    expect(text).toContain('Not set');
    expect(text).not.toContain('null-null');
  });

  it('renders package and add-on navigation as one compact tab group', () => {
    const fixture = TestBed.createComponent(AdminPackagesPage);
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelector('nav[aria-label="Packages and menu sections"]');

    expect(tabs?.classList.contains('admin-section-tabs')).toBe(true);
    expect(tabs?.querySelectorAll('a')).toHaveLength(2);
  });

  it('locks duplicate saves while pending and shows the backend error reason', () => {
    const pending = new Subject<unknown>();
    api.savePackage.mockReturnValue(pending);
    const component = TestBed.createComponent(AdminPackagesPage).componentInstance as any;
    component.create();
    component.form.patchValue({ eventId: 1, name: 'PHP 680', pricingType: 'PER_HEAD', pricePerGuest: 680 });

    component.save();
    component.save();
    expect(api.savePackage).toHaveBeenCalledTimes(1);
    expect(component.saving()).toBe(true);

    pending.error(new HttpErrorResponse({ status: 400, error: { message: 'Package pricing is invalid.' } }));
    expect(component.saving()).toBe(false);
    expect(component.formError()).toBe('Package pricing is invalid.');

    api.savePackage.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.save();
    expect(component.formError()).toContain('Cannot connect');
  });
});
