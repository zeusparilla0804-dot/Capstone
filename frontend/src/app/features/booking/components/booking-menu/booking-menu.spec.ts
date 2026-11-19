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
  it('keeps a saved dish available and validates the required side category until selected', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'pork', label: 'Pork dish' },
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles', 'Vegetables'] },
    ], includedItems: ['Steamed rice'] });
    fixture.componentRef.setInput('values', { pork: 'Saved pork dish' });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const pork = page.querySelector<HTMLSelectElement>('#menu-pork')!;
    expect(pork.value).toBe('Saved pork dish');
    expect(Array.from(pork.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice', 'Saved pork dish']);
    const select = page.querySelector<HTMLSelectElement>('#menu-sideKind')!;
    fixture.componentRef.setInput('showErrors', true); fixture.detectChanges();
    expect(select.getAttribute('aria-invalid')).toBe('true');
    select.value = 'Pasta'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.componentInstance.values()).toEqual({ pork: 'Saved pork dish', sideKind: 'Pasta' });
    expect(page.querySelectorAll('[aria-invalid=true]')).toHaveLength(0);
  });
});
