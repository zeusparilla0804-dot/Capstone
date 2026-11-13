import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsteriskPasswordDirective } from './asterisk-password.directive';

@Component({
  imports: [ReactiveFormsModule, AsteriskPasswordDirective],
  template: '<div style="position:relative"><input appAsteriskPassword [type]="show() ? \'text\' : \'password\'" [formControl]="password" /></div>',
})
class PasswordHost {
  readonly password = new FormControl('', { nonNullable: true });
  readonly show = signal(false);
}

describe('AsteriskPasswordDirective touch input', () => {
  let coarse = false;
  let change: (() => void) | undefined;
  let restoreMatchMedia: PropertyDescriptor | undefined;
  const removeEventListener = vi.fn();

  beforeEach(() => {
    coarse = false;
    change = undefined;
    removeEventListener.mockReset();
    restoreMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({
      get matches() { return coarse; },
      addEventListener: (_event: string, listener: () => void) => { change = listener; },
      removeEventListener,
    })) });
    TestBed.configureTestingModule({ imports: [PasswordHost] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (restoreMatchMedia) Object.defineProperty(window, 'matchMedia', restoreMatchMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
  });

  it('uses native masking on a phone while preserving typing, selection, and visibility toggling', () => {
    coarse = true;
    const fixture = TestBed.createComponent(PasswordHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'A b!2345';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.setSelectionRange(3, 3);
    fixture.detectChanges();
    expect(fixture.componentInstance.password.value).toBe('A b!2345');
    expect(input.selectionStart).toBe(3);
    expect(input.type).toBe('password');
    expect(input.style.color).not.toBe('transparent');
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
    fixture.componentInstance.show.set(true);
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('A b!2345');
  });

  it('removes the desktop overlay and restores native styles when switching to touch input', () => {
    const fixture = TestBed.createComponent(PasswordHost);
    fixture.componentInstance.password.setValue('Ab!23456');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    coarse = true;
    change?.();
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
    expect(input.style.color).not.toBe('transparent');
    expect(input.value).toBe('Ab!23456');
    coarse = false;
    change?.();
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    fixture.destroy();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
