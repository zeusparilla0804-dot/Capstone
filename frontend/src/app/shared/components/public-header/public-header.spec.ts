import { stubNativeDialogs } from '../../testing/native-dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { PublicHeaderComponent } from './public-header';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('PublicHeaderComponent', () => {
  let restoreNativeDialog: () => void;
  beforeEach(() => { restoreNativeDialog = stubNativeDialogs(); });
  afterEach(() => { TestBed.resetTestingModule(); restoreNativeDialog(); });
  let fixture: ComponentFixture<PublicHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicHeaderComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(), provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: '7',
              fullName: 'zeus parilla',
              email: 'zeus@example.test',
              role: 'customer',
            }),
            ensureAuthenticated: vi.fn().mockResolvedValue(true),
            logout: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicHeaderComponent);
    fixture.detectChanges();
  });

  it('uses the authenticated customer initials instead of a fixed label', () => {
    const avatar = fixture.nativeElement.querySelector('.public-header__account-avatar') as HTMLElement;
    expect(avatar.textContent?.trim()).toBe('ZP');
    expect(fixture.nativeElement.querySelector('.public-header__account-copy strong').textContent).toBe('zeus parilla');
    expect(fixture.nativeElement.querySelector('.public-header__account-trigger').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens existing account routes and closes on outside click', () => {
    const trigger = fixture.nativeElement.querySelector('.public-header__account-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll('.public-header__account-menu a')) as HTMLAnchorElement[];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/dashboard', '/profile']);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    document.body.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.public-header__account-menu')).toBeNull();
  });

  it('supports arrow-key navigation and Escape returns focus to the trigger', () => {
    const trigger = fixture.nativeElement.querySelector('.public-header__account-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges(); trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const first = fixture.nativeElement.querySelector('.public-header__account-menu a') as HTMLElement;
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.public-header__account-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the customer signed in and restores account focus when confirmation is cancelled', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const trigger = fixture.nativeElement.querySelector('.public-header__account-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.public-header__account-menu button') as HTMLButtonElement).click();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="cancel"]')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens the shared La Chef dialog instead of a browser popup and cancels without logging out', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const trigger = fixture.nativeElement.querySelector('.public-header__account-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.public-header__account-menu button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const dialog = document.querySelector<HTMLDialogElement>('app-logout-dialog dialog');
    expect(dialog).not.toBeNull();
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(dialog?.textContent).toContain('Log out of La Chef?');
    expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
    dialog?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    await fixture.whenStable();
    expect(document.querySelector('app-logout-dialog')).toBeNull();
    expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
  });

  it('uses the existing logout service only after confirmation before returning to the home route', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const trigger = fixture.nativeElement.querySelector('.public-header__account-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('.public-header__account-menu button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="confirm"]')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(fixture.nativeElement.querySelector('.public-header__account-menu')).toBeNull();
  });

  it('preserves the approved warm-gold LA brand accent on the light header', () => {
    const accent = fixture.nativeElement.querySelector('.public-header__brand-accent') as HTMLElement;

    expect(accent).not.toBeNull();
    expect(accent.textContent?.trim()).toBe('LA');
    expect(getComputedStyle(accent).color).toBe('rgb(184, 134, 43)');
  });

  it('supports the approved brand-free authentication header', () => {
    fixture.componentRef.setInput('appearance', 'auth');
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.public-header') as HTMLElement;
    expect(header.classList.contains('public-header--auth')).toBe(true);
    expect(
      fixture.nativeElement.querySelector('.public-header__brand-tagline')?.textContent?.trim(),
    ).toBe('Event Catering Services');
  });
});
