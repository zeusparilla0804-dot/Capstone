import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActionFeedbackService } from '../../../core/services/action-feedback.service';
import { stubNativeDialogs } from '../../testing/native-dialog';
import { ActionFeedbackComponent } from './action-feedback';

@Component({ imports: [ActionFeedbackComponent], template: '<button id="trigger" type="button">Edit package</button><button id="disabled" disabled>Unavailable</button><section id="existing-dialog" role="dialog" aria-label="Image editor" hidden><button id="move-image" type="button">Move image left</button></section><app-action-feedback />' })
class Host {}

describe('Application feedback host', () => {
  let restore: () => void;
  beforeEach(() => { restore = stubNativeDialogs(); TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] }); });
  afterEach(() => { TestBed.resetTestingModule(); restore(); });

  it('opens a labelled result dialog, focuses acknowledgement and restores focus on dismissal', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement; trigger.focus();
    const feedback = TestBed.inject(ActionFeedbackService);
    feedback.show({ tone: 'success', title: 'Cash payment recorded', message: 'Receipt: CASH-123' });
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true); expect(dialog.getAttribute('aria-labelledby')).toBe('action-feedback-title');
    expect(dialog.textContent).toContain('Receipt: CASH-123');
    expect(document.activeElement).toBe(dialog.querySelector('button'));
    dialog.querySelector('button')!.click(); await fixture.whenStable();
    expect(dialog.open).toBe(false); expect(document.activeElement).toBe(trigger);
    expect(fixture.nativeElement.querySelector('.action-acknowledgement')).toBeNull();
  });

  it('focuses Cancel and does not run an action when Escape dismisses confirmation', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const feedback = TestBed.inject(ActionFeedbackService); const action = vi.fn();
    feedback.confirm({ title: 'Reject proof?', message: 'Reason: wrong account.', confirmLabel: 'Confirm rejection', destructive: true }, action);
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(document.activeElement?.textContent).toBe('Cancel');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true })); await fixture.whenStable();
    expect(action).not.toHaveBeenCalled(); expect(dialog.open).toBe(false);
    expect(feedback.notice()).toBeNull();
  });

  it('keeps local and disabled buttons silent', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const feedback = TestBed.inject(ActionFeedbackService);
    fixture.nativeElement.querySelector('#trigger').click();
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(feedback.notice()).toBeNull(); expect(feedback.confirmation()).toBeNull();
    fixture.nativeElement.querySelector('#disabled').click();
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(fixture.nativeElement.querySelector('.action-acknowledgement')).toBeNull();
  });

  it('retains the actual result dialog without adding click feedback', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const feedback = TestBed.inject(ActionFeedbackService);
    const trigger = fixture.nativeElement.querySelector('#trigger') as HTMLButtonElement;
    trigger.click();
    await new Promise(resolve => setTimeout(resolve, 220)); expect(feedback.notice()).toBeNull();
    feedback.show({ tone: 'error', title: 'Action not completed', message: 'Try again.' }); await fixture.whenStable();
    trigger.click(); await new Promise(resolve => setTimeout(resolve, 220));
    expect(feedback.notice()?.title).toBe('Action not completed');
    expect(fixture.nativeElement.querySelector('.action-acknowledgement')).toBeNull();
  });

  it('keeps editor buttons silent without duplicating an existing or newly opened dialog', async () => {
    const fixture = TestBed.createComponent(Host); await fixture.whenStable();
    const feedback = TestBed.inject(ActionFeedbackService);
    const editor = fixture.nativeElement.querySelector('#existing-dialog') as HTMLElement;
    editor.hidden = false;
    fixture.nativeElement.querySelector('#move-image').click();
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(feedback.notice()).toBeNull();
    editor.hidden = true;
    fixture.nativeElement.querySelector('#trigger').addEventListener('click', () => { editor.hidden = false; }, { once: true });
    fixture.nativeElement.querySelector('#trigger').click();
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(feedback.notice()).toBeNull();
    expect(fixture.nativeElement.querySelector('.action-acknowledgement')).toBeNull();
  });
});
