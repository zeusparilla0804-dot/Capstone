import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PackageService } from '../../core/services/package.service';
import { HomePageComponent } from './home.page';

describe('HomePageComponent', () => {
  let fixture: ComponentFixture<HomePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: PackageService,
          useValue: {
            popularPackages: signal([]),
            load: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal(null),
            ensureAuthenticated: vi.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
  });

  it('uses a gold LA accent in the dark footer brand lockup', () => {
    const accent = fixture.nativeElement.querySelector('.site-footer__brand-accent') as HTMLElement;

    expect(accent).not.toBeNull();
    expect(accent.textContent?.trim()).toBe('LA');
    expect(getComputedStyle(accent).color).toBe('rgb(209, 164, 77)');
  });

  it('publishes the client-confirmed contact directory instead of a placeholder email', () => {
    const footer = fixture.nativeElement.querySelector('.site-footer') as HTMLElement;
    expect(footer.textContent).toContain('Panorama Ville, Dita, Santa Rosa, Laguna');
    expect([...footer.querySelectorAll('a[href^="tel:"]')].map(link => link.getAttribute('href'))).toEqual([
      'tel:+639392987324', 'tel:+639260894301', 'tel:+639479662352',
    ]);
    expect(footer.querySelector('a[href^="mailto:"]')).toBeNull();
    expect([...footer.querySelectorAll('nav a')].map(link => link.getAttribute('href'))).toEqual([
      '/', '/packages', '/events', '/about', '/contact', '/login',
    ]);
    expect(footer.querySelector('a[href="#"], a[href=""]')).toBeNull();
  });
});
