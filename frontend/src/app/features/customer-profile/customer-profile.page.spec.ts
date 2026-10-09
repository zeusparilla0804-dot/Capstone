import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CustomerProfilePageComponent } from './customer-profile.page';

describe('CustomerProfilePageComponent', () => {
  it('renders the authenticated customer account details', async () => {
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', phone: '09171234567', role: 'customer' as const }),
      logout: async () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [CustomerProfilePageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });

    const fixture = TestBed.createComponent(CustomerProfilePageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Zeus Parilla');
    expect(content).toContain('parilla@gmail.com');
    expect(content).toContain('09171234567');
    expect(fixture.nativeElement.querySelector('.profile-avatar')?.textContent.trim()).toBe('ZP');
  });
});
