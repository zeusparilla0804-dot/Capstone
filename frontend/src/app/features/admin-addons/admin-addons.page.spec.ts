import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminAddOnsPage } from './admin-addons.page';

describe('AdminAddOnsPage layout', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminAddOnsPage],
      providers: [
        provideRouter([]),
        {
          provide: AdminService,
          useValue: {
            addOns: vi.fn(() => of({ success: true, data: [] })),
            saveAddOn: vi.fn(() => of({ success: true })),
          },
        },
        {
          provide: AdminAuthService,
          useValue: { idleWarning: signal(false), user: signal({ fullName: 'Admin' }), logout: vi.fn(), logoutAll: vi.fn() },
        },
      ],
    });
  });

  it('uses compact catalog tabs and an aligned visibility row with grouped actions', () => {
    const fixture = TestBed.createComponent(AdminAddOnsPage);
    const component = fixture.componentInstance as unknown as { create(): void };
    component.create();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-section-tabs')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('label.admin-visibility-field input[type="checkbox"]')).not.toBeNull();
    const actions = fixture.nativeElement.querySelector('.admin-form-actions');
    expect(actions).not.toBeNull();
    expect(actions.querySelectorAll('button')).toHaveLength(2);
  });

  it('keeps the create opener out of an active editor and restores it after cancel', () => {
    const fixture = TestBed.createComponent(AdminAddOnsPage);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[admin-actions]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-form button[type="submit"]')).not.toBeNull();

    fixture.nativeElement.querySelector('.admin-form-actions button[type="button"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-form')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[admin-actions]')).not.toBeNull();
  });
});
