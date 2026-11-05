import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SimpleInfoPageComponent } from './simple-info.page';

describe('SimpleInfoPageComponent', () => {
  const auth = {
    user: signal(null),
    ensureAuthenticated: vi.fn().mockResolvedValue(false),
  };

  async function render(page: 'about' | 'contact'): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [SimpleInfoPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SimpleInfoPageComponent> =
      TestBed.createComponent(SimpleInfoPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('presents the approved LA Chef business identity on the About route', async () => {
    const root = await render('about');

    expect(root.querySelector('h1')?.textContent).toContain('Gatherings made personal');
    expect(root.textContent).toContain('LA-Chef Event Catering Services');
    expect(root.textContent).toContain('Santa Rosa, Laguna');
    expect(root.querySelector('.info-story a[href="/packages"]')?.textContent).toContain(
      'Explore packages',
    );
    expect(root.textContent).toContain('add special requests to the reservation');
    expect(root.textContent).not.toMatch(/quotation|custom event request/i);
  });

  it('renders actionable confirmed contact details on the Contact route', async () => {
    const root = await render('contact');
    const phoneLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]'));
    const messenger = root.querySelector<HTMLAnchorElement>(
      'a[href="https://www.facebook.com/share/1F8DnqJnB9/"]',
    );

    expect(root.querySelector('h1')?.textContent).toContain('Plan your celebration with us');
    expect(root.textContent).toContain('Panorama Ville, Dita, Santa Rosa, Laguna');
    expect(phoneLinks.map((link) => link.getAttribute('href'))).toEqual([
      'tel:+639392987324',
      'tel:+639260894301',
      'tel:+639479662352',
    ]);
    expect(messenger?.target).toBe('_blank');
    expect(messenger?.rel).toContain('noopener');
    expect(messenger?.rel).toContain('noreferrer');
  });
});
