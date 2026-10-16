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
    expect(link?.textContent).toContain('Chat with LA Chef');
  });

  it('hides on admin routes and responds to route changes without reloading', async () => {
    const root = await renderAt('/dashboard');
    expect(root.querySelector('a')).not.toBeNull();

    await router.navigateByUrl('/admin/dashboard');
    fixture.detectChanges();
    expect(root.querySelector('a')).toBeNull();

    await router.navigateByUrl('/packages');
    fixture.detectChanges();
    expect(root.querySelector('a')).not.toBeNull();
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
