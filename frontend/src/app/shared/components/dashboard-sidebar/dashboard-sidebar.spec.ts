import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardSidebarComponent } from './dashboard-sidebar';

describe('DashboardSidebarComponent', () => {
  let fixture: ComponentFixture<DashboardSidebarComponent>;
  beforeEach(async () => {
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
});

