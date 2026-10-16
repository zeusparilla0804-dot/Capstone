import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PortalNavigationStateService } from '../../../core/services/portal-navigation-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from './dashboard-sidebar';

describe('DashboardSidebarComponent', () => {
  let fixture: ComponentFixture<DashboardSidebarComponent>;
  beforeEach(async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.localStorage.clear();
    await TestBed.configureTestingModule({ imports: [DashboardSidebarComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(DashboardSidebarComponent);
    fixture.componentRef.setInput('title', 'Administrator'); fixture.componentRef.setInput('subtitle', 'Administrator'); fixture.componentRef.setInput('navItems', [{ label: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' }]); fixture.detectChanges();
  });

  it('makes a closed mobile drawer inert, manages focus, and closes with Escape', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize')); fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector('[aria-controls="dashboard-navigation"]') as HTMLButtonElement;
    const drawer = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(drawer.hasAttribute('inert')).toBe(true);
    toggle.click(); fixture.detectChanges();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.classList.contains('is-open')).toBe(true);
    expect(drawer.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.dashboard-sidebar__close'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('renders initials from the first and last parts of the account name', () => {
    fixture.componentRef.setInput('title', 'zeus parilla');
    fixture.detectChanges();

    const avatar = fixture.nativeElement.querySelector('.dashboard-sidebar__avatar') as HTMLElement;
    expect(avatar.textContent?.trim()).toBe('ZP');
  });

  it('groups account actions together in one navigation footer', () => {
    fixture.componentRef.setInput('navItems', [
      { label: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' },
      { label: 'Sign out all devices', route: '/admin/login', icon: 'logout', isAction: true },
      { label: 'Logout', route: '/admin/login', icon: 'logout', isAction: true },
    ]);
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector('.dashboard-sidebar__actions') as HTMLElement | null;
    expect(actions).toBeTruthy();
    expect(actions!.querySelectorAll('.dashboard-sidebar__action')).toHaveLength(2);
  });

  it('emits a configured account action only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const emitted: DashboardNavItem[] = [];
    const logout = {
      label: 'Logout', route: '/', icon: 'logout', isAction: true,
      confirmationMessage: 'Are you sure you want to log out?',
    } as DashboardNavItem & { confirmationMessage: string };
    fixture.componentInstance.navAction.subscribe(item => emitted.push(item));
    fixture.componentRef.setInput('navItems', [logout]);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.dashboard-sidebar__action') as HTMLButtonElement;
    button.click();
    expect(confirm).toHaveBeenCalledWith('Are you sure you want to log out?');
    expect(emitted).toEqual([]);

    confirm.mockReturnValue(true);
    button.click();
    expect(emitted).toEqual([logout]);
  });

  it('keeps administrator brand navigation inside the administrator portal', () => {
    const brands = fixture.nativeElement.querySelectorAll(
      '.dashboard-mobile-header__brand, .dashboard-sidebar__brand',
    ) as NodeListOf<HTMLAnchorElement>;

    expect(Array.from(brands, brand => brand.getAttribute('href'))).toEqual([
      '/admin/dashboard',
      '/admin/dashboard',
    ]);
  });

  it('keeps customer brand navigation inside the customer portal', () => {
    fixture.componentRef.setInput('navItems', [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Logout', route: '/', icon: 'logout', isAction: true },
    ]);
    fixture.detectChanges();
    const brands = fixture.nativeElement.querySelectorAll(
      '.dashboard-mobile-header__brand, .dashboard-sidebar__brand',
    ) as NodeListOf<HTMLAnchorElement>;

    expect(Array.from(brands, brand => brand.getAttribute('href'))).toEqual([
      '/dashboard',
      '/dashboard',
    ]);
  });

  it('renders only positive navigation badges with contextual accessible text', () => {
    fixture.componentRef.setInput('navItems', [
      { label: 'Bookings', route: '/admin/bookings', icon: 'calendar', badge: 4, badgeLabel: 'pending booking reviews' },
      { label: 'Payments', route: '/admin/payments', icon: 'wallet', badge: 0, badgeLabel: 'payments awaiting review' },
    ]);
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('.dashboard-sidebar__badge') as NodeListOf<HTMLElement>;
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent?.trim()).toBe('4');
    expect(badges[0]!.getAttribute('aria-label')).toBe('4 pending booking reviews');
  });

  it('collapses and expands the desktop sidebar through persisted navigation state', () => {
    const state = TestBed.inject(PortalNavigationStateService);
    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    const collapse = fixture.nativeElement.querySelector('.dashboard-sidebar__collapse') as HTMLButtonElement;
    const chevron = collapse.querySelector('path') as SVGPathElement;

    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    expect(chevron.getAttribute('d')).toBe('m15 18-6-6 6-6');
    collapse.click();
    fixture.detectChanges();

    expect(state.collapsed()).toBe(true);
    expect(sidebar.classList.contains('is-collapsed')).toBe(true);
    expect(collapse.getAttribute('aria-expanded')).toBe('false');
    expect(chevron.getAttribute('d')).toBe('m9 18 6-6-6-6');
    expect(window.localStorage.getItem('la-chef.portal-sidebar-collapsed')).toBe('true');
    expect((fixture.nativeElement.querySelector('nav a') as HTMLAnchorElement).title).toBe('Dashboard');
  });

  it('keeps full navigation labels in the mobile drawer despite a collapsed desktop preference', () => {
    TestBed.inject(PortalNavigationStateService).setCollapsed(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    const label = fixture.nativeElement.querySelector('nav a span') as HTMLElement;
    expect(sidebar.classList.contains('is-collapsed')).toBe(false);
    expect(label.textContent?.trim()).toBe('Dashboard');
  });
});

