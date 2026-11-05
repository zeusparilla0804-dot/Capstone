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
});
