import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { MessengerContactComponent } from './messenger-contact';

@Component({ template: '' })
class EmptyPage {}

describe('MessengerContactComponent', () => {
  let fixture: ComponentFixture<MessengerContactComponent>;
  let router: Router;
  const configuredUrl = 'https://www.facebook.com/share/1F8DnqJnB9/';

  beforeEach(() => {
    environment.messengerUrl = configuredUrl;
    TestBed.configureTestingModule({
      imports: [MessengerContactComponent],
      providers: [provideRouter([
        { path: '', component: EmptyPage },
        { path: 'packages', component: EmptyPage },
        { path: 'contact', component: EmptyPage },
        { path: 'dashboard', component: EmptyPage },
        { path: 'admin/dashboard', component: EmptyPage },
      ])],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    environment.messengerUrl = configuredUrl;
  });

  async function renderAt(url: string): Promise<HTMLElement> {
    fixture = TestBed.createComponent(MessengerContactComponent);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a secure, accessible external Messenger action on public routes', async () => {
    const root = await renderAt('/packages');
    const link = root.querySelector<HTMLAnchorElement>('a');
    expect(link?.href).toBe(configuredUrl);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    expect(link?.rel).toContain('noreferrer');
    expect(link?.getAttribute('aria-label')).toBe('Message LA Chef on Messenger');
    expect(link?.textContent).toContain('Message');
    expect(link?.querySelector('.messenger-contact__glyph')).not.toBeNull();
    expect(getComputedStyle(link!).backgroundColor).toBe('rgb(8, 102, 255)');
    expect(getComputedStyle(link!.querySelector('.messenger-contact__mark')!).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('hides on admin and dedicated contact routes while responding to route changes', async () => {
    const root = await renderAt('/dashboard');
    expect(root.querySelector('a')).not.toBeNull();

    await router.navigateByUrl('/contact');
    fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();

    await router.navigateByUrl('/admin/dashboard');
    fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();

    await router.navigateByUrl('/packages');
    fixture.detectChanges();
    expect(root.querySelector('a')).not.toBeNull();
  });

  it('keeps page controls clickable when the floating shortcut would cover them', async () => {
    const root = await renderAt('/dashboard');
    const link = root.querySelector<HTMLAnchorElement>('a')!;
    const main = document.createElement('main');
    const button = document.createElement('button');
    button.textContent = 'Save booking changes';
    main.append(button);
    document.body.append(main);
    vi.spyOn(link, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 700, 112, 42));
    const buttonRect = vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(800, 700, 212, 44));
    try {
      window.dispatchEvent(new Event('scroll'));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      fixture.detectChanges();
      expect(getComputedStyle(link).visibility).toBe('hidden');
      expect(getComputedStyle(link).pointerEvents).toBe('none');
      expect(root.querySelector('a')).toBe(link);

      buttonRect.mockReturnValue(new DOMRect(800, 500, 212, 44));
      window.dispatchEvent(new Event('scroll'));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      fixture.detectChanges();
      expect(getComputedStyle(link).visibility).toBe('visible');
    } finally {
      main.remove();
    }
  });

  it.each(['', 'http://www.facebook.com/messages/t/1', 'javascript:alert(1)', 'not-a-url'])(
    'renders nothing for invalid configuration %s',
    async value => {
      environment.messengerUrl = value;
      const root = await renderAt('/packages');
      expect(root.querySelector('a')).toBeNull();
    },
  );
});
