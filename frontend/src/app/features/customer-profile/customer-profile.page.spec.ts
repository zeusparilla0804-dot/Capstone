import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
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
    TestBed.inject(PortalBadgeStateService).setCustomerBookings([
      { status: 'pending' }, { status: 'confirmed' }, { status: 'completed' },
    ] as never);

    const fixture = TestBed.createComponent(CustomerProfilePageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Zeus Parilla');
    expect(content).toContain('parilla@gmail.com');
    expect(content).toContain('09171234567');
    expect(content).not.toContain('Sign out all devices');
    expect(fixture.nativeElement.querySelector('.profile-avatar')?.textContent.trim()).toBe('ZP');
    expect(fixture.nativeElement.querySelector('a[href="/my-bookings"] .dashboard-sidebar__badge')?.textContent.trim()).toBe('2');
  });

  it('keeps the customer signed in when logout confirmation is cancelled', async () => {
    const logout = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const auth = {
      user: signal({ id: '42', fullName: 'Zeus Parilla', email: 'parilla@gmail.com', phone: '09171234567', role: 'customer' as const }),
      logout,
    };
    TestBed.configureTestingModule({
      imports: [CustomerProfilePageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(CustomerProfilePageComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === 'Logout')!;
    button.click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith('Are you sure you want to log out?');
    expect(logout).not.toHaveBeenCalled();
  });
});
