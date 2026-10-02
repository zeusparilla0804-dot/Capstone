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

  it('opens as a labeled drawer and closes with Escape', () => {
    const toggle = fixture.nativeElement.querySelector('[aria-controls="dashboard-navigation"]') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('aside').classList.contains('is-open')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

