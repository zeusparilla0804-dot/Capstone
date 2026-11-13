import { PaymentDestinationService } from '../../core/services/payment-destination.service';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';
import { EventCompletionComponent } from './event-completion';

describe('Final event payment and completion', () => {
  const booking = { id: 42, reference: 'BK-EVENT-42', customerName: 'Customer', total: 80000, amountPaid: 40000,
    eventDate: '2026-01-01', status: 'PAYMENT_VERIFIED', paymentMethod: 'BANK_TRANSFER', invoiceId: 8 };
  let api: { completeEvent: ReturnType<typeof vi.fn> };
  beforeEach(() => { api = { completeEvent: vi.fn((_id: number, _input: { requestId: string }) => of({ success: true, data: { status: 'COMPLETED' } })) };
    TestBed.configureTestingModule({ imports: [EventCompletionComponent], providers: [{ provide: AdminService, useValue: api }, { provide: PaymentDestinationService, useValue: { adminOptions: () => of([{ id: 2, method: 'BANK_TRANSFER', label: 'Bank B', accountName: 'LA Chef', accountHint: '2222', version: 'b'.repeat(64) }]) } }] }); });
  function render(value = booking) { const fixture = TestBed.createComponent(EventCompletionComponent); fixture.componentRef.setInput('booking', value); fixture.detectChanges(); return fixture; }

  it('requires actual funds, payment method and event-finished confirmation before recording the remaining balance', () => {
    const fixture = render(); const component = fixture.componentInstance as any;
    expect(component.canSubmit()).toBe(false); component.method.set('CASH'); component.fundsReceived.set(true); component.eventFinished.set(true);
    expect(component.canSubmit()).toBe(true); component.submit(); expect(api.completeEvent).not.toHaveBeenCalled();
    expect(TestBed.inject(ActionFeedbackService).confirmation()?.message).toContain('40,000.00');
    TestBed.inject(ActionFeedbackService).decide(true);
    expect(api.completeEvent).toHaveBeenCalledWith(42, expect.objectContaining({ amount: 40000, method: 'CASH', fundsReceived: true, eventFinished: true }));
  });
  it('prefills the saved bank method and requires its actual reference before completing the event', () => {
    const fixture = render(); const component = fixture.componentInstance as any;
    expect(component.method()).toBe('BANK_TRANSFER');
    component.fundsReceived.set(true); component.eventFinished.set(true);
    expect(component.canSubmit()).toBe(false);
    component.reference.set('BANK-FINAL-42'); component.receivingBank.set(2); component.submit();
    TestBed.inject(ActionFeedbackService).decide(true);
    expect(api.completeEvent).toHaveBeenCalledWith(42, expect.objectContaining({ amount: 40000, method: 'BANK_TRANSFER', reference: 'BANK-FINAL-42', destinationId: 2, destinationVersion: 'b'.repeat(64) }));
  });
  it('cancels without recording and blocks duplicate requests while saving', () => {
    const response = new Subject(); api.completeEvent.mockReturnValue(response);
    const fixture = render(); const component = fixture.componentInstance as any;
    component.method.set('CASH'); component.fundsReceived.set(true); component.eventFinished.set(true);
    component.submit(); TestBed.inject(ActionFeedbackService).decide(false); expect(api.completeEvent).not.toHaveBeenCalled();
    component.submit(); TestBed.inject(ActionFeedbackService).decide(true); component.submit(); expect(api.completeEvent).toHaveBeenCalledOnce();
  });
  it('completes an already-paid event with zero additional money', () => {
    const fixture = render({ ...booking, amountPaid: 80000 }); const component = fixture.componentInstance as any;
    component.eventFinished.set(true); expect(component.canSubmit()).toBe(true); component.submit(); TestBed.inject(ActionFeedbackService).decide(true);
    expect(api.completeEvent).toHaveBeenCalledWith(42, expect.objectContaining({ amount: 0, fundsReceived: false }));
  });
  it('does not enable completion before the event date and requires a bank reference', () => {
    const fixture = render({ ...booking, eventDate: '2099-12-01' }); const component = fixture.componentInstance as any;
    component.method.set('CASH'); component.fundsReceived.set(true); component.eventFinished.set(true); expect(component.canSubmit()).toBe(false);
    fixture.componentRef.setInput('booking', booking); fixture.detectChanges(); component.method.set('BANK_TRANSFER');
    expect(component.canSubmit()).toBe(false); component.reference.set('ACTUAL-BANK-42'); component.receivingBank.set(2); expect(component.canSubmit()).toBe(true);
  });
  it('retains a completion key after a failed response so retry cannot duplicate the payment', () => {
    api.completeEvent.mockReturnValue(throwError(() => ({ error: { message: 'Network unavailable.' } })));
    const fixture = render(); const component = fixture.componentInstance as any;
    component.method.set('CASH'); component.fundsReceived.set(true); component.eventFinished.set(true);
    component.submit(); TestBed.inject(ActionFeedbackService).decide(true);
    component.submit(); TestBed.inject(ActionFeedbackService).decide(true);
    expect(api.completeEvent.mock.calls[1]?.[1].requestId).toBe(api.completeEvent.mock.calls[0]?.[1].requestId);
    expect(component.error()).toContain('Network unavailable');
  });
});
