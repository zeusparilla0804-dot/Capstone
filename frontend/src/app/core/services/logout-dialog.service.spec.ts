import { TestBed } from '@angular/core/testing';
import { NavigationStart, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { stubNativeDialogs } from '../../shared/testing/native-dialog';
import { LogoutDialogService } from './logout-dialog.service';

describe('LogoutDialogService', () => {
  let restoreDialog: () => void;
  let service: LogoutDialogService;
  const dialog = () => document.querySelector<HTMLDialogElement>('app-logout-dialog dialog')!;
  const button = (action: string) => dialog().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  beforeEach(() => {
    restoreDialog = stubNativeDialogs();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(LogoutDialogService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    restoreDialog();
    document.body.style.overflow = '';
  });

  it('opens one branded modal, focuses the safe action and preserves the previous scroll lock', async () => {
    document.body.style.overflow = 'hidden';
    const trigger = document.createElement('button');
    document.body.append(trigger); trigger.focus();
    const result = service.confirm();
    TestBed.tick();
    expect(dialog().open).toBe(true);
    expect(dialog().getAttribute('aria-labelledby')).toBe('logout-dialog-title');
    expect(dialog().textContent).toContain('Log out of La Chef?');
    expect(document.activeElement).toBe(button('cancel'));
    button('cancel').click();
    expect(await result).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(document.querySelector('app-logout-dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    trigger.remove();
  });

  it('resolves true only after clicking the primary action and restores scrolling', async () => {
    const result = service.confirm(); TestBed.tick();
    expect(document.body.style.overflow).toBe('hidden');
    button('confirm').click();
    expect(await result).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('treats the browser Escape/cancel event as staying signed in', async () => {
    const result = service.confirm(); TestBed.tick();
    const event = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(await result).toBe(false);
  });

  it('does not dismiss for content clicks but cancels a backdrop click', async () => {
    const result = service.confirm(); TestBed.tick();
    dialog().querySelector('h2')!.click();
    expect(dialog()).not.toBeNull();
    dialog().dispatchEvent(new MouseEvent('click', { clientX: -1, clientY: -1 }));
    expect(await result).toBe(false);
  });

  it('deduplicates simultaneous requests without adding another modal', async () => {
    const first = service.confirm(); const second = service.confirm(); TestBed.tick();
    expect(first).toBe(second);
    expect(document.querySelectorAll('app-logout-dialog')).toHaveLength(1);
    button('cancel').click(); expect(await first).toBe(false);
  });

  it('clearly distinguishes ending all administrator sessions', async () => {
    const result = service.confirm(true); TestBed.tick();
    expect(dialog().textContent).toContain('Sign out all devices?');
    expect(dialog().textContent).toContain('Unsaved form changes will be lost.');
    expect(button('confirm').textContent?.trim()).toBe('Sign out all devices');
    button('cancel').click(); expect(await result).toBe(false);
  });

  it('cancels on navigation rather than carrying a stale confirmation to another page', async () => {
    const events = new Subject<NavigationStart>();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { events } }] });
    service = TestBed.inject(LogoutDialogService);
    const result = service.confirm(); TestBed.tick();
    events.next(new NavigationStart(1, '/login'));
    expect(await result).toBe(false);
    expect(document.querySelector('app-logout-dialog')).toBeNull();
  });
});
