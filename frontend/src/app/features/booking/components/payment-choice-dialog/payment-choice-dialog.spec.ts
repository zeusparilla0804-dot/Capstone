import { TestBed } from '@angular/core/testing';
import { PaymentChoiceDialogComponent } from './payment-choice-dialog';
import { stubNativeDialogs } from '../../../../shared/testing/native-dialog';

describe('PaymentChoiceDialogComponent Cash terms', () => {
  let restore: () => void;
  beforeEach(() => { restore = stubNativeDialogs(); });
  afterEach(() => { TestBed.resetTestingModule(); restore(); });

  function setup(cash: boolean) {
    const fixture = TestBed.createComponent(PaymentChoiceDialogComponent);
    fixture.componentRef.setInput('methodLabel', cash ? 'Cash' : 'Bank Transfer');
    fixture.componentRef.setInput('reference', 'BK-CASH');
    fixture.componentRef.setInput('cashTerms', cash);
    fixture.componentRef.setInput('cashDeposit', 42_944);
    fixture.componentRef.setInput('cashDeadline', { date: '2027-01-07', at: '2027-01-07T10:00:00.000Z', preparationDays: 3 });
    const decisions: boolean[] = [];
    fixture.componentInstance.decided.subscribe(value => decisions.push(value));
    fixture.detectChanges();
    return { fixture, decisions };
  }

  it('shows Cash instructions and blocks confirmation until the customer explicitly accepts the terms', () => {
    const { fixture, decisions } = setup(true);
    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Cash payment terms');
    expect(content).toContain('Panorama Ville, Dita, Santa Rosa, Laguna');
    expect(content).toContain('8:00 AM');
    expect(content).toContain('42,944.00');
    expect(content).toContain('January 7, 2027');
    expect(content).toContain('6:00 PM');
    expect(content).toContain('does not count as a payment');
    const confirm = fixture.nativeElement.querySelector('[data-testid="confirm-approved-payment"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(decisions).toEqual([]);
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click(); fixture.detectChanges();
    expect(confirm.disabled).toBe(false);
    checkbox.click(); fixture.detectChanges();
    expect(confirm.disabled).toBe(true);
    checkbox.click(); fixture.detectChanges(); confirm.click();
    expect(decisions).toEqual([true]);
  });

  it('cancels Cash without agreement and starts each reopened dialog unchecked', () => {
    const { fixture, decisions } = setup(true);
    (fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    fixture.nativeElement.querySelector('.btn-secondary').click();
    expect(decisions).toEqual([false]);
    fixture.destroy();
    const reopened = setup(true).fixture;
    expect((reopened.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('keeps online confirmation separate from Cash terms', () => {
    const { fixture, decisions } = setup(false);
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Cash payment terms');
    fixture.nativeElement.querySelector('[data-testid="confirm-approved-payment"]').click();
    expect(decisions).toEqual([true]);
  });
});
