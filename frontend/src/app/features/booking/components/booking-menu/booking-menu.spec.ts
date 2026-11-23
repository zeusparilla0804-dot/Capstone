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

  it.each([
    ['sideKind', 'sideDish', 'Side dish category', { Pasta: ['Bolognese'], Noodles: ['Pansit Malabon'], Vegetables: ['Chopsuey'] }],
    ['firstMainProtein', 'firstMainDish', 'First main dish category', { Beef: ['Beef Salpicao'], Pork: ['Grilled Liempo'] }],
  ])('shows a photo for each available %s category and selects the category', (key, dishKey, label, byCategory) => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    const options = Object.keys(byCategory);
    fixture.componentRef.setInput('definition', { fields: [
      { key, label, options },
      { key: dishKey, label: 'Dish', dishChoices: { categoryField: key, byCategory } },
    ], includedItems: [] });
    fixture.componentRef.setInput('values', { [key]: options[0], [dishKey]: Object.values(byCategory)[0][0] });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    const opener = page.querySelector<HTMLButtonElement>(`[aria-controls="dish-photos-${key}"]`)!;
    expect(opener.hidden).toBe(false);
    expect(page.querySelectorAll('img')).toHaveLength(0);
    opener.click();
    fixture.detectChanges();

    const gallery = page.querySelector(`#dish-photos-${key}`)!;
    const tiles = Array.from(gallery.querySelectorAll<HTMLButtonElement>('button'));
    expect(tiles.map(tile => tile.textContent?.trim())).toEqual(options);
    expect(gallery.querySelectorAll('img')).toHaveLength(options.length);
    expect(gallery.textContent).toContain(`Example: ${Object.values(byCategory)[1][0]}`);
    tiles[1].click();
    fixture.detectChanges();

    expect(page.querySelector<HTMLSelectElement>(`#menu-${key}`)!.value).toBe(options[1]);
    expect(page.querySelector<HTMLSelectElement>(`#menu-${dishKey}`)!.value).toBe('LA Chef’s choice');
    expect(page.querySelector(`#dish-photos-${key}`)).toBeNull();
  });

  it('shows the appetizer example without adding a new dish choice', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', {
      fields: [{ key: 'appetizer', label: 'Appetizer' }], includedItems: [],
    });
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    const opener = page.querySelector<HTMLButtonElement>('[aria-controls="dish-photos-appetizer"]')!;
    expect(opener.hidden).toBe(false);
    opener.click();
    fixture.detectChanges();

    const gallery = page.querySelector('#dish-photos-appetizer')!;
    expect(gallery.querySelectorAll('img')).toHaveLength(1);
    expect(gallery.textContent).toContain('LA Chef will confirm the appetizer');
    const select = page.querySelector<HTMLSelectElement>('#menu-appetizer')!;
    expect(Array.from(select.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice']);
  });

  it('shows included items as reference photos on request', () => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    fixture.componentRef.setInput('definition', {
      fields: [], includedItems: ['Steamed rice', 'Purified water with tube ice'],
    });
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelectorAll('img')).toHaveLength(0);
    const opener = page.querySelector<HTMLButtonElement>('[aria-controls="dish-photos-included"]');
    expect(opener).not.toBeNull();
    opener!.click();
    fixture.detectChanges();

    const gallery = page.querySelector('#dish-photos-included')!;
    expect(gallery.querySelectorAll('img')).toHaveLength(2);
    expect(gallery.querySelectorAll('button')).toHaveLength(0);
    expect(gallery.textContent).toContain('Steamed rice');
    expect(gallery.textContent).toContain('Purified water with tube ice');
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
    expect(fixture.nativeElement.querySelector('#dish-photos-sideDish')).toBeNull();
    category.value = 'Noodles';
    category.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(side.value).toBe('LA Chef’s choice');
    expect(Array.from(side.options).map(option => option.value)).toEqual(['', 'LA Chef’s choice', 'Pansit Malabon']);
    expect(fixture.nativeElement.querySelector('#dish-photos-sideDish')).toBeNull();
    side.value = 'Pansit Malabon';
    side.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.values()).toEqual({ sideKind: 'Noodles', sideDish: 'Pansit Malabon' });
  });

  it.each([
    ['sideKind', 'sideDish', { Pasta: ['Bolognese'], Noodles: ['Pansit Malabon'], Vegetables: ['Chopsuey'] }],
    ['firstMainProtein', 'firstMainDish', { Beef: ['Beef Salpicao'], Pork: ['Grilled Liempo'] }],
  ] as const)('offers dish photos before %s is chosen and fills it when a dish is picked', (categoryKey, dishKey, byCategory) => {
    const fixture = TestBed.createComponent(BookingMenuComponent);
    const categories = Object.keys(byCategory);
    const dishes = Object.values(byCategory).flat();
    const chosen = dishes[1];
    fixture.componentRef.setInput('definition', { fields: [
      { key: categoryKey, label: 'Dish category', options: categories },
      { key: dishKey, label: 'Preferred dish', dishChoices: { categoryField: categoryKey, byCategory } },
    ], includedItems: [] });
    fixture.componentInstance.changed.subscribe(values => fixture.componentRef.setInput('values', values));
    fixture.detectChanges();

    const page: HTMLElement = fixture.nativeElement;
    const select = page.querySelector<HTMLSelectElement>(`#menu-${dishKey}`)!;
    expect(Array.from(select.options).map(option => option.value)).toContain(chosen);
    expect(page.querySelector(`#dish-photos-${dishKey}`)).toBeNull();
    page.querySelector<HTMLButtonElement>(`[aria-controls="dish-photos-${dishKey}"]`)!.click();
    fixture.detectChanges();
    const gallery = page.querySelector(`#dish-photos-${dishKey}`)!;
    expect(gallery.querySelectorAll('img')).toHaveLength(dishes.length);
    Array.from(gallery.querySelectorAll('button')).find(button => button.textContent?.trim() === chosen)!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.values()).toEqual({ [categoryKey]: categories[1], [dishKey]: chosen });
    expect(page.querySelector<HTMLSelectElement>(`#menu-${categoryKey}`)!.value).toBe(categories[1]);
    expect(select.value).toBe(chosen);
    expect(Array.from(select.options).map(option => option.value)).not.toContain(dishes[0]);
  });
});
