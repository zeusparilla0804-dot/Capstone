import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PortalBadgeStateService } from '../../core/services/portal-badge-state.service';
import { DashboardNavItem, DashboardSidebarComponent } from '../../shared/components/dashboard-sidebar/dashboard-sidebar';
import { customerNavItems } from '../../shared/navigation/customer-navigation';
import { initialsForName } from '../../shared/utils/user-display';
import { PHILIPPINE_MOBILE_PATTERN } from '../../shared/utils/phone-number';

@Component({
  selector: 'app-customer-profile-page',
  imports: [DashboardSidebarComponent, ReactiveFormsModule],
  templateUrl: './customer-profile.page.html',
  styleUrl: './customer-profile.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProfilePageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly badgeState = inject(PortalBadgeStateService);
  protected readonly navItems = computed(() => customerNavItems(this.badgeState.customerBookingCount(), this.badgeState.customerBillingCount()));
  protected readonly initials = computed(() => initialsForName(this.auth.user()?.fullName));
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly editingPhone = signal(false);
  protected readonly savingPhone = signal(false);
  protected readonly phoneError = signal('');
  protected readonly phoneSaved = signal(false);
  protected readonly phoneControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(PHILIPPINE_MOBILE_PATTERN), Validators.maxLength(30)],
  });
  protected readonly phoneForm = new FormGroup({ phone: this.phoneControl });

  protected editPhone(): void {
    this.phoneControl.reset(this.auth.user()?.phone ?? '');
    this.phoneError.set('');
    this.phoneSaved.set(false);
    this.editingPhone.set(true);
    this.focusPhoneElement('#profile-phone');
  }

  protected cancelPhoneEdit(): void {
    if (this.savingPhone()) return;
    this.editingPhone.set(false);
    this.phoneError.set('');
    this.focusPhoneElement('.profile-phone-edit');
  }

  protected async savePhone(): Promise<void> {
    if (this.savingPhone() || !this.editingPhone()) return;
    this.phoneError.set('');
    if (this.phoneControl.invalid) {
      this.phoneControl.markAsTouched();
      this.focusPhoneElement('#profile-phone');
      return;
    }
    this.savingPhone.set(true);
    this.phoneControl.disable({ emitEvent: false });
    try {
      await this.auth.updatePhone(this.phoneControl.getRawValue());
      this.editingPhone.set(false);
      this.phoneSaved.set(true);
      this.focusPhoneElement('.profile-phone-edit');
    } catch (error) {
      this.phoneError.set(error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
        ? error.error.message : 'Unable to update your contact number. Please try again.');
    } finally {
      this.phoneControl.enable({ emitEvent: false });
      this.savingPhone.set(false);
    }
  }

  private focusPhoneElement(selector: string): void {
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  protected async handleNavAction(item: DashboardNavItem): Promise<void> {
    if (item.label === 'Logout') {
      await this.auth.logout();
      await this.router.navigate([item.route]);
    }
  }

}
