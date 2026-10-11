import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminLoginPage } from './admin-login.page';

describe('AdminLoginPage', () => {
  let fixture: ComponentFixture<AdminLoginPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLoginPage],
      providers: [
        provideRouter([]),
        { provide: AdminAuthService, useValue: { login: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminLoginPage);
    fixture.detectChanges();
  });

  it('links administrator sign-in to administrator password recovery', () => {
    const link = fixture.nativeElement.querySelector('a[href="/admin/forgot-password"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Forgot password');
  });
});
