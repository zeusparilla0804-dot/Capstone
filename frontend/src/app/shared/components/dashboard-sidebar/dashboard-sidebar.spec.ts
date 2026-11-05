import { stubNativeDialogs } from '../../testing/native-dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PortalNavigationStateService } from '../../../core/services/portal-navigation-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from './dashboard-sidebar';

describe('DashboardSidebarComponent', () => {
  let restoreNativeDialog: () => void;
  beforeEach(() => { restoreNativeDialog = stubNativeDialogs(); });
  afterEach(() => { TestBed.resetTestingModule(); restoreNativeDialog(); });
  let fixture: ComponentFixture<DashboardSidebarComponent>;
  beforeEach(async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.localStorage.clear();
    await TestBed.configureTestingModule({ imports: [DashboardSidebarComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(DashboardSidebarComponent);
    fixture.componentRef.setInput('title', 'Administrator'); fixture.componentRef.setInput('subtitle', 'Administrator'); fixture.componentRef.setInput('navItems', [{ label: 'Dashboard', route: '/admin/dashboard', icon: 'dashboard' }]); fixture.detectChanges();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.dispatchEvent(new Event('resize'));
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

  it('renders the editorial brand lockup with a clickable customer profile card', () => {
    fixture.componentRef.setInput('appearance', 'editorial');
    fixture.componentRef.setInput('title', 'klint charles fajardo');
    fixture.componentRef.setInput('subtitle', 'Customer');
    fixture.componentRef.setInput('navItems', [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Profile', route: '/profile', icon: 'profile' },
    ]);
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    expect(sidebar.classList).toContain('dashboard-sidebar--editorial');
    const brand = sidebar.querySelector('.dashboard-sidebar__editorial-brand') as HTMLElement;
    expect(brand).not.toBeNull();
    const name = brand.querySelector('.dashboard-sidebar__editorial-name') as HTMLElement;
    expect(brand.querySelector('svg')).toBeNull();
    expect(name).not.toBeNull();
    const nameParts = name.querySelectorAll('span') as NodeListOf<HTMLElement>;
    expect(Array.from(nameParts, part => getComputedStyle(part).fontSize)).toEqual(['2.15rem', '2.15rem']);
    expect(Array.from(nameParts, part => getComputedStyle(part).fontFamily)).toEqual([
      '"Playfair Display", Georgia, serif',
      '"Playfair Display", Georgia, serif',
    ]);
    expect(Array.from(nameParts, part => getComputedStyle(part).textTransform)).toEqual(['none', 'none']);
    expect(getComputedStyle(brand).justifyItems).toBe('center');
    expect(getComputedStyle(brand).textAlign).toBe('center');
    expect(brand.textContent).toContain('LA Chef');
    expect(brand.textContent).toContain('Event Catering Services');
    const accents = fixture.nativeElement.querySelectorAll('.dashboard-brand__accent') as NodeListOf<HTMLElement>;
    expect(accents).toHaveLength(2);
    expect(Array.from(accents, accent => accent.textContent?.trim())).toEqual(['LA', 'LA']);
    expect(Array.from(accents, accent => getComputedStyle(accent).color)).toEqual([
      'rgb(209, 164, 77)',
      'rgb(209, 164, 77)',
    ]);
    const profile = sidebar.querySelector('a.dashboard-sidebar__profile') as HTMLAnchorElement;
    expect(profile).not.toBeNull();
    expect(profile.getAttribute('href')).toBe('/profile');
    expect(profile.textContent).toContain('KF');
    expect(profile.textContent).toContain('klint charles fajardo');
    expect(profile.textContent).toContain('Customer');
    expect(getComputedStyle(profile).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    const activeLink = sidebar.querySelector('nav a') as HTMLAnchorElement;
    activeLink.classList.add('is-active');
    expect(getComputedStyle(activeLink).color).toBe('rgb(223, 182, 95)');
  });

  it('preserves standard sidebar profile typography', () => {
    const name = fixture.nativeElement.querySelector('.dashboard-sidebar__profile strong') as HTMLElement;
    expect(getComputedStyle(name).fontWeight).toBe('700');
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

  it('emits a configured account action only once after custom confirmation', async () => {
    const emitted: DashboardNavItem[] = [];
    const logout: DashboardNavItem = {label:'Logout',route:'/',icon:'logout',isAction:true,confirmationMessage:'Are you sure you want to log out?'};
    fixture.componentInstance.navAction.subscribe(item => emitted.push(item));
    fixture.componentRef.setInput('navItems',[logout]); fixture.detectChanges();
    const button=fixture.nativeElement.querySelector('.dashboard-sidebar__action') as HTMLButtonElement;
    button.click();button.click();await fixture.whenStable();
    expect(document.querySelectorAll('app-logout-dialog')).toHaveLength(1);expect(emitted).toEqual([]);
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="cancel"]')!.click();await fixture.whenStable();
    expect(emitted).toEqual([]);
    button.click();await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('app-logout-dialog [data-action="confirm"]')!.click();await fixture.whenStable();
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

  it('keeps the mobile drawer and focus intact when all-device sign-out is cancelled', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    const item = { label: 'Sign out all devices', route: '/admin/login', icon: 'logout', isAction: true,
      confirmationMessage: 'Sign out all devices?', confirmationAllDevices: true } as DashboardNavItem & { confirmationAllDevices: boolean };
    fixture.componentRef.setInput('navItems', [item]); fixture.detectChanges();
    const emitted: DashboardNavItem[] = [];
    fixture.componentInstance.navAction.subscribe(action => emitted.push(action));
    fixture.nativeElement.querySelector('button[aria-label="Toggle dashboard navigation"]').click(); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.dashboard-sidebar__action') as HTMLButtonElement;
    trigger.focus(); trigger.click(); await fixture.whenStable();
    const dialog = document.querySelector<HTMLDialogElement>('app-logout-dialog dialog')!;
    expect(dialog.textContent).toContain('Sign out all devices?');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog.dispatchEvent(new Event('cancel', { cancelable: true })); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside').classList.contains('is-open')).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(emitted).toEqual([]);
  });

  it.each(['standard', 'editorial'] as const)('links the %s customer logo to the public Home page while keeping Dashboard navigation', (appearance) => {
    fixture.componentRef.setInput('appearance', appearance);
    fixture.componentRef.setInput('navItems', [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Logout', route: '/', icon: 'logout', isAction: true },
    ]);
    fixture.detectChanges();
    const brands = fixture.nativeElement.querySelectorAll(
      '.dashboard-mobile-header__brand, .dashboard-sidebar__brand, .dashboard-sidebar__editorial-brand',
    ) as NodeListOf<HTMLAnchorElement>;

    expect(Array.from(brands, brand => brand.getAttribute('href'))).toEqual([
      '/',
      '/',
    ]);
    expect(Array.from(brands, brand => brand.getAttribute('aria-label'))).toEqual([
      'LA Chef home',
      'LA Chef home',
    ]);
    expect((fixture.nativeElement.querySelector('nav a') as HTMLAnchorElement).getAttribute('href')).toBe('/dashboard');
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
    fixture.componentRef.setInput('appearance', 'editorial');
    TestBed.inject(PortalNavigationStateService).setCollapsed(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    const sidebar = fixture.nativeElement.querySelector('.dashboard-sidebar') as HTMLElement;
    const label = fixture.nativeElement.querySelector('nav a span') as HTMLElement;
    expect(sidebar.classList.contains('is-collapsed')).toBe(false);
    expect(label.textContent?.trim()).toBe('Dashboard');
    expect((fixture.nativeElement as HTMLElement).style.width).toBe('100%');
  });
});

