import { TestBed } from '@angular/core/testing';
import { ActionFeedbackService } from './action-feedback.service';

describe('ActionFeedbackService', () => {
  it('requires an explicit confirmation and runs an action once', () => {
    const feedback = TestBed.inject(ActionFeedbackService); const action = vi.fn();
    feedback.confirm({ title: 'Record cash payment?', message: 'Record PHP 123?', confirmLabel: 'Record payment' }, action);
    expect(action).not.toHaveBeenCalled();
    feedback.decide(true); feedback.decide(true);
    expect(action).toHaveBeenCalledOnce();
  });
  it('cancels without running the action or opening another popup', () => {
    const feedback = TestBed.inject(ActionFeedbackService); const action = vi.fn();
    feedback.confirm({ title: 'Reject proof?', message: 'Reason', confirmLabel: 'Reject' }, action);
    feedback.decide(false);
    expect(action).not.toHaveBeenCalled(); expect(feedback.confirmation()).toBeNull(); expect(feedback.notice()).toBeNull();
  });
  it('queues distinct results without losing earlier feedback', () => {
    const feedback = TestBed.inject(ActionFeedbackService);
    feedback.show({ tone: 'success', title: 'Saved', message: 'Saved to server.' });
    feedback.show({ tone: 'error', title: 'Not saved', message: 'Try again.' });
    expect(feedback.notice()?.title).toBe('Saved'); feedback.dismiss();
    expect(feedback.notice()?.title).toBe('Not saved'); feedback.dismiss(); expect(feedback.notice()).toBeNull();
  });
});
