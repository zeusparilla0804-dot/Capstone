import { TestBed } from '@angular/core/testing';
import { BookingMenuComponent } from './booking-menu';

describe('Booking menu preferences', () => {
  it('displays a saved category when the menu is first opened for editing', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles', 'Vegetables'] },
    ], includedItems: ['Steamed rice'] });
    fixture.componentRef.setInput('values', { sideKind: 'Pasta' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#menu-sideKind').value).toBe('Pasta');
  });
  it('validates entered preferences before blur and emits corrected dish and category selections', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'pork', label: 'Pork dish' },
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles', 'Vegetables'] },
    ], includedItems: ['Steamed rice'] });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const input = page.querySelector<HTMLInputElement>('#menu-pork')!;
    expect(input.getAttribute('aria-invalid')).toBe('false');
    input.value = 'x'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(page.textContent).toContain('2 to 120 characters');
    input.value = 'Pork dish preference'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    const select = page.querySelector<HTMLSelectElement>('#menu-sideKind')!;
    select.value = 'Pasta'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.componentInstance.values()).toEqual({ pork: 'Pork dish preference', sideKind: 'Pasta' });
    fixture.componentRef.setInput('showErrors', true); fixture.detectChanges();
    expect(page.querySelectorAll('[aria-invalid=true]')).toHaveLength(0);
  });
});
