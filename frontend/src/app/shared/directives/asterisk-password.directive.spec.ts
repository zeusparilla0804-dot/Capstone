import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AsteriskPasswordDirective } from './asterisk-password.directive';

@Component({
  imports: [ReactiveFormsModule, AsteriskPasswordDirective],
  template: '<div style="position:relative"><input [appAsteriskPassword]="enabled()" [type]="show() ? \'text\' : \'password\'" [formControl]="password" /></div>',
})
class PasswordHost {
  readonly password = new FormControl('', { nonNullable: true });
  readonly show = signal(false);
  readonly enabled = signal(true);
}

describe('AsteriskPasswordDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PasswordHost] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps asterisks on a phone with equal-width input text while preserving editing and visibility toggling', () => {
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
    expect(input.style.fontFamily).toBe('monospace');
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    fixture.componentInstance.show.set(true);
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('A b!2345');
    expect(input.style.fontFamily).not.toBe('monospace');
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
  });

  it('uses matching font metrics on desktop and touch, restoring original styles when disabled', () => {
    const fixture = TestBed.createComponent(PasswordHost);
    fixture.componentInstance.password.setValue('Ab!23456');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.style.fontFamily = 'serif';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    expect(input.style.fontFamily).toBe('monospace');
    fixture.componentInstance.enabled.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.password-field__mask')).toBeNull();
    expect(input.style.color).not.toBe('transparent');
    expect(input.style.fontFamily).toBe('serif');
    expect(input.value).toBe('Ab!23456');
    fixture.componentInstance.enabled.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.password-field__mask')?.textContent).toBe('********');
    fixture.destroy();
    expect(input.style.fontFamily).toBe('serif');
  });
});
