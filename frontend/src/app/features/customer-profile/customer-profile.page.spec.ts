import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { CustomerProfilePageComponent } from './customer-profile.page';
import { stubNativeDialogs } from '../../shared/testing/native-dialog';

describe('CustomerProfilePageComponent', () => {
  let restoreNativeDialog: () => void;
  beforeEach(() => { restoreNativeDialog = stubNativeDialogs(); });
  afterEach(() => { TestBed.resetTestingModule(); restoreNativeDialog(); });
  function phoneEditor(phone: string) {
    const user = signal({ id: '42', fullName: 'Zeus Parilla', email: 'customer@example.test', phone, role: 'customer' as const });
    const updatePhone = vi.fn(async (value: string) => { user.update(current => ({ ...current, phone: value.replaceAll(' ', '') })); });
    TestBed.configureTestingModule({
      imports: [CustomerProfilePageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { user, updatePhone } }],
    });
    const fixture = TestBed.createComponent(CustomerProfilePageComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as any, user, updatePhone };
  }

  it('allows the customer to replace an invalid saved phone and displays the saved result', async () => {
    const { fixture, component, user, updatePhone } = phoneEditor('09999999999999999999999');
    (fixture.nativeElement.querySelector('.profile-phone-edit') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.phoneControl.value).toBe(user().phone);
    component.phoneControl.setValue('0917 123 4567');
    await component.savePhone();
    fixture.detectChanges();
    expect(updatePhone).toHaveBeenCalledWith('0917 123 4567');
    expect(fixture.nativeElement.querySelector('#profile-phone')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('09171234567');
    expect(fixture.nativeElement.textContent).toContain('Contact number updated.');
  });

  it('adds a missing contact number and rejects invalid numbers without saving', async () => {
    const { fixture, component, updatePhone } = phoneEditor('');
    const button = fixture.nativeElement.querySelector('.profile-phone-edit') as HTMLButtonElement;
    expect(button.textContent).toContain('Add');
    button.click();
    for (const phone of ['', '09999999999999999999999', '02 8123 4567', 'letters']) {
      component.phoneControl.setValue(phone);
      await component.savePhone();
      fixture.detectChanges();
      expect(updatePhone).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#profile-phone-error')?.textContent).toContain('Philippine mobile number');
    }
    component.phoneControl.setValue('+639171234567');
    await component.savePhone();
    expect(updatePhone).toHaveBeenCalledTimes(1);
  });

  it('cancels edits without changing the saved contact number', () => {
    const { component, user, updatePhone } = phoneEditor('09171234567');
    component.editPhone();
    component.phoneControl.setValue('09181234567');
    component.cancelPhoneEdit();
    expect(component.editingPhone()).toBe(false);
    expect(user().phone).toBe('09171234567');
    expect(updatePhone).not.toHaveBeenCalled();
  });

  it('prevents duplicate saves and retains the edit when the server rejects it', async () => {
    const { fixture, component, user, updatePhone } = phoneEditor('09171234567');
    let reject!: (error: Error) => void;
    updatePhone.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
    component.editPhone();
    component.phoneControl.setValue('09181234567');
    const pending = component.savePhone();
    await component.savePhone();
    fixture.detectChanges();
    expect(updatePhone).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.profile-phone-save')?.disabled).toBe(true);
    reject(new Error('Connection failed'));
    await pending;
    fixture.detectChanges();
    expect(component.editingPhone()).toBe(true);
    expect(user().phone).toBe('09171234567');
    expect(fixture.nativeElement.textContent).toContain('Unable to update your contact number. Please try again.');
  });

  it('uses the approved warm ivory customer portal background', async () => {
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

    const page = fixture.nativeElement.querySelector('.profile-layout') as HTMLElement;
    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    expect(getComputedStyle(page).backgroundColor).toBe('rgb(247, 245, 239)');
    expect(sidebar.classList).toContain('dashboard-sidebar--editorial');
    expect(sidebar.querySelector('.dashboard-sidebar__editorial-brand')?.textContent).toContain('Event Catering Services');
    expect(sidebar.querySelector('a.dashboard-sidebar__profile')).not.toBeNull();
  });

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

  it('groups identity and editable contact details without adding a duplicate reservation CTA', async () => {
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

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[aria-labelledby="profile-identity-title"]')).not.toBeNull();
    expect(root.querySelector('[aria-labelledby="contact-information-title"]')).not.toBeNull();
    expect(root.querySelector('[aria-labelledby="reservation-actions-title"]')).toBeNull();
    expect(root.querySelectorAll('a[href="/book-event"]')).toHaveLength(0);
    expect(root.textContent).toContain('Phone number');
  });

  it('uses the approved medium weight for account values', async () => {
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

    const accountValue = fixture.nativeElement.querySelector('.profile-details dd') as HTMLElement;
    expect(getComputedStyle(accountValue).fontWeight).toBe('500');
  });

  it('presents the customer identity on a premium high-contrast surface', async () => {
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

    const identity = fixture.nativeElement.querySelector('.profile-identity') as HTMLElement;
    const name = identity.querySelector('h2') as HTMLElement;
    const accountId = identity.querySelector('.profile-account-id') as HTMLElement;

    expect(getComputedStyle(identity).backgroundColor).toBe('rgb(23, 24, 20)');
    expect(getComputedStyle(name).color).toBe('rgb(251, 250, 246)');
    expect(getComputedStyle(accountId).color).toBe('rgb(201, 197, 186)');
  });

  it('keeps the email link clean without a persistent underline', async () => {
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

    const emailLink = fixture.nativeElement.querySelector('.profile-details a') as HTMLAnchorElement;
    expect(getComputedStyle(emailLink).textDecorationLine).toBe('none');
  });

  it('keeps the customer signed in when logout confirmation is cancelled', async () => {
    const logout = vi.fn(async () => undefined);
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
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

    expect(document.querySelector('app-logout-dialog')?.textContent).toContain('Log out of La Chef?');
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="cancel"]')!.click();
    await fixture.whenStable();
    expect(browserConfirm).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});
