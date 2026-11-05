import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { stubNativeDialogs } from '../../testing/native-dialog';
import { SuccessDialogComponent } from './success-dialog';

describe('SuccessDialogComponent', () => {
  let fixture: ComponentFixture<SuccessDialogComponent> | undefined;
  let restoreDialogs: (() => void) | undefined;
  const addedElements: HTMLElement[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SuccessDialogComponent], providers: [provideRouter([])] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    restoreDialogs?.();
    restoreDialogs = undefined;
    document.body.style.overflow = '';
    addedElements.splice(0).forEach(element => element.remove());
    vi.useRealTimers();
  });

  function create(nativeModal = false): ComponentFixture<SuccessDialogComponent> {
    fixture = TestBed.createComponent(SuccessDialogComponent);
    fixture.componentRef.setInput('title', 'Reservation approved');
    fixture.componentRef.setInput('message', 'The reservation has been approved successfully.');
    fixture.componentRef.setInput('primaryLabel', 'Done');
    if (nativeModal) fixture.componentRef.setInput('nativeModal', true);
    return fixture;
  }

  function button(): HTMLButtonElement {
    return fixture!.nativeElement.querySelector('.success-dialog__actions button');
  }

  function addButton(): HTMLButtonElement {
    const element = document.createElement('button');
    document.body.append(element);
    addedElements.push(element);
    return element;
  }

  it('keeps customer navigation links in the default section without native dialog APIs', () => {
    const component = create();
    component.componentRef.setInput('primaryLabel', 'View My Reservations');
    component.componentRef.setInput('primaryLink', '/my-bookings');
    component.componentRef.setInput('secondaryLabel', 'Return to Dashboard');
    component.componentRef.setInput('secondaryLink', '/dashboard');
    document.body.style.overflow = 'auto';
    component.detectChanges();

    expect(component.nativeElement.querySelector('dialog')).toBeNull();
    expect(component.nativeElement.querySelector('section[role="dialog"]')).not.toBeNull();
    expect(component.nativeElement.querySelector('.btn-primary').getAttribute('href')).toBe('/my-bookings');
    expect(component.nativeElement.querySelector('.btn-secondary').getAttribute('href')).toBe('/dashboard');
    expect(document.body.style.overflow).toBe('auto');
  });

  it.each([false, true])('offers a non-navigating Done button when no primary link is supplied (native: %s)', nativeModal => {
    if (nativeModal) restoreDialogs = stubNativeDialogs();
    vi.useFakeTimers();
    const component = create(nativeModal);
    const dismissed = vi.fn();
    component.componentInstance.dismissed.subscribe(dismissed);
    component.detectChanges();

    expect(button().type).toBe('button');
    expect(component.nativeElement.querySelector('.success-dialog__actions a')).toBeNull();
    button().click();
    button().click();
    vi.advanceTimersByTime(159);
    expect(dismissed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('opens an opt-in native modal and focuses Done while locking page scroll', () => {
    restoreDialogs = stubNativeDialogs();
    const component = create(true);
    component.detectChanges();

    const dialog = component.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('success-dialog-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('success-dialog-message');
    expect(component.nativeElement.querySelector('.success-dialog__backdrop')).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('keeps the native modal open during its exit when Escape requests dismissal', () => {
    restoreDialogs = stubNativeDialogs();
    vi.useFakeTimers();
    const component = create(true);
    const dismissed = vi.fn();
    component.componentInstance.dismissed.subscribe(dismissed);
    component.detectChanges();
    const dialog = component.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const cancel = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(cancel);
    component.detectChanges();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('data-closing')).toBe('true');
    vi.advanceTimersByTime(160);
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('restores the previous scroll setting and connected trigger on destruction', () => {
    restoreDialogs = stubNativeDialogs();
    const trigger = addButton();
    trigger.focus();
    document.body.style.overflow = 'clip';
    const component = create(true);
    component.detectChanges();
    const dialog = component.nativeElement.querySelector('dialog') as HTMLDialogElement;

    component.destroy();

    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(trigger);
  });

  it('uses the supplied focus fallback when refreshing removes the original trigger', () => {
    restoreDialogs = stubNativeDialogs();
    const trigger = addButton();
    const fallback = addButton();
    trigger.focus();
    const component = create(true);
    component.componentRef.setInput('restoreFocusTo', fallback);
    component.detectChanges();
    trigger.remove();

    component.destroy();

    expect(document.activeElement).toBe(fallback);
  });

  it('uses the focus fallback when a refresh has already removed the focused trigger', () => {
    restoreDialogs = stubNativeDialogs();
    const fallback = addButton();
    const component = create(true);
    component.componentRef.setInput('restoreFocusTo', fallback);
    component.detectChanges();

    component.destroy();

    expect(document.activeElement).toBe(fallback);
  });

  it('cancels a pending dismissal when the component is destroyed', () => {
    vi.useFakeTimers();
    const component = create();
    const dismissed = vi.fn();
    component.componentInstance.dismissed.subscribe(dismissed);
    component.detectChanges();
    component.nativeElement.querySelector('.success-dialog__close').click();

    component.destroy();
    vi.advanceTimersByTime(160);

    expect(dismissed).not.toHaveBeenCalled();
  });
});
