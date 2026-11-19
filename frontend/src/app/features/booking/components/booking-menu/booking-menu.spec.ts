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
      { key: 'pork', label: 'Pork dish', dishChoices: ['Grilled Liempo'] },
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles', 'Vegetables'] },
    ], includedItems: ['Steamed rice'] });
    fixture.componentRef.setInput('values', { pork: 'Saved pork dish' });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const pork = page.querySelector<HTMLSelectElement>('#menu-pork')!;
    expect(pork.value).toBe('Saved pork dish');
    expect(Array.from(pork.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice', 'Grilled Liempo', 'Saved pork dish']);
    const select = page.querySelector<HTMLSelectElement>('#menu-sideKind')!;
    fixture.componentRef.setInput('showErrors', true); fixture.detectChanges();
    expect(select.getAttribute('aria-invalid')).toBe('true');
    select.value = 'Pasta'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(fixture.componentInstance.values()).toEqual({ pork: 'Saved pork dish', sideKind: 'Pasta' });
    expect(page.querySelectorAll('[aria-invalid=true]')).toHaveLength(0);
  });

  it('filters dishes by category and clears the previous dish when the category changes', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles'] },
      { key: 'sideDish', label: 'Preferred side dish', dishChoices: {
        categoryField: 'sideKind', byCategory: { Pasta: ['Bolognese'], Noodles: ['Pansit Malabon'] },
      } },
    ], includedItems: [] });
    fixture.componentRef.setInput('values', { sideKind: 'Pasta', sideDish: 'Bolognese' });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();

    const side = fixture.nativeElement.querySelector('#menu-sideDish') as HTMLSelectElement;
    const category = fixture.nativeElement.querySelector('#menu-sideKind') as HTMLSelectElement;
    expect(side.value).toBe('Bolognese');
    category.value = 'Noodles';
    category.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(side.value).toBe('LA Chef’s choice');
    expect(Array.from(side.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice', 'Pansit Malabon']);
    side.value = 'Pansit Malabon';
    side.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.values()).toEqual({ sideKind: 'Noodles', sideDish: 'Pansit Malabon' });
  });
});
