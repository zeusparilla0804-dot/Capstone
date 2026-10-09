import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { PublicHeaderComponent } from './public-header';

describe('PublicHeaderComponent', () => {
  let fixture: ComponentFixture<PublicHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicHeaderComponent],
      providers: [
        provideRouter([]),
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
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicHeaderComponent);
    fixture.detectChanges();
  });

  it('uses the authenticated customer initials instead of a fixed label', () => {
    const avatar = fixture.nativeElement.querySelector('.public-header__avatar') as HTMLElement;
    expect(avatar.textContent?.trim()).toBe('ZP');
    expect(avatar.getAttribute('href')).toBe('/profile');
  });
});
