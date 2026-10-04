import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AuthPageComponent } from './auth.page';

describe('AuthPageComponent', () => {
  let fixture: ComponentFixture<AuthPageComponent>;
  let auth: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    user: ReturnType<typeof signal<null>>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    auth = {
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
      user: signal(null),
    };
    await TestBed.configureTestingModule({
      imports: [AuthPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AuthPageComponent);
    fixture.detectChanges();
  });

  it('signs in with email and password without validating hidden registration fields', async () => {
    const component = fixture.componentInstance as unknown as {
      form: {
        controls: {
          email: { setValue(value: string): void };
          password: { setValue(value: string): void };
        };
      };
      submit(): Promise<void>;
    };
    component.form.controls.email.setValue('customer@example.test');
    component.form.controls.password.setValue('short123');

    await component.submit();

    expect(auth.login).toHaveBeenCalledWith('customer@example.test', 'short123');
    expect(auth.register).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
