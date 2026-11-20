import { TestBed } from '@angular/core/testing';
import { BookingMenuComponent } from './booking-menu';

describe('Booking menu preferences', () => {
  it('shows reference photos for available dishes and picks the original menu option', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'chicken', label: 'Chicken dish', dishChoices: ['Chicken Inasal', 'Chicken Teriyaki'] },
      { key: 'dessert', label: 'Dessert', dishChoices: ['Leche Flan'] },
    ], includedItems: ['Steamed rice'] });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const open = page.querySelector<HTMLButtonElement>('[aria-controls="dish-photos-chicken"]')!;
    expect(page.querySelectorAll('img')).toHaveLength(0);
    open.click();
    fixture.detectChanges();

    const gallery = page.querySelector<HTMLElement>('#dish-photos-chicken')!;
    const choices = Array.from(gallery.querySelectorAll<HTMLButtonElement>('button'));
    expect(gallery.querySelectorAll('img')).toHaveLength(2);
    expect(gallery.textContent).toContain('Reference photos');
    expect(gallery.textContent).not.toContain('Leche Flan');
    choices.find(choice => choice.textContent?.trim() === 'Chicken Teriyaki')!.click();
    fixture.detectChanges();

    expect(page.querySelector<HTMLSelectElement>('#menu-chicken')!.value).toBe('Chicken Teriyaki');
    expect(fixture.componentInstance.values()).toEqual({ chicken: 'Chicken Teriyaki' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(page.querySelector('#dish-photos-chicken')).toBeNull();
  });

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
    expect(fixture.nativeElement.querySelector('#dish-photos-sideDish')?.textContent).toContain('Bolognese');
    category.value = 'Noodles';
    category.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(side.value).toBe('LA Chef’s choice');
    expect(Array.from(side.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice', 'Pansit Malabon']);
    const gallery = fixture.nativeElement.querySelector('#dish-photos-sideDish');
    expect(gallery?.querySelectorAll('img')).toHaveLength(1);
    expect(gallery.textContent).toContain('Pansit Malabon');
    side.value = 'Pansit Malabon';
    side.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.values()).toEqual({ sideKind: 'Noodles', sideDish: 'Pansit Malabon' });
  });

  it('offers side dishes and photos before a category is chosen, then fills the category when a dish is picked', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', { fields: [
      { key: 'sideKind', label: 'Side dish category', options: ['Pasta', 'Noodles', 'Vegetables'] },
      { key: 'sideDish', label: 'Preferred side dish', dishChoices: {
        categoryField: 'sideKind', byCategory: { Pasta: ['Bolognese'], Noodles: ['Pansit Malabon'], Vegetables: ['Chopsuey'] },
      } },
    ], includedItems: [] });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    const side = page.querySelector<HTMLSelectElement>('#menu-sideDish')!;
    expect(Array.from(side.options).map(option => option.value)).toContain('Chopsuey');
    const gallery = page.querySelector('#dish-photos-sideDish');
    expect(gallery?.querySelectorAll('img')).toHaveLength(3);
    if (!gallery) throw new Error('Expected side dish photos to be visible immediately');
    Array.from(gallery.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Pansit Malabon')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.values()).toEqual({ sideKind: 'Noodles', sideDish: 'Pansit Malabon' });
    expect(page.querySelector<HTMLSelectElement>('#menu-sideKind')!.value).toBe('Noodles');
    expect(side.value).toBe('Pansit Malabon');
    expect(Array.from(side.options).map(option => option.value)).not.toContain('Bolognese');
  });
});
