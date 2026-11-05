import { Component, computed, ElementRef, HostListener, ViewChild, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PortalNavigationStateService } from '../../../core/services/portal-navigation-state.service';
import { LogoutDialogService } from '../../../core/services/logout-dialog.service';
import { initialsForName } from '../../utils/user-display';

export interface DashboardNavItem {
  readonly label: string;
  readonly route: string;
  readonly icon?: 'dashboard' | 'calendar' | 'wallet' | 'profile' | 'mail' | 'audit' | 'catalog' | 'reports' | 'logout';
  readonly isAction?: boolean;
  readonly showActiveState?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly busyLabel?: string;
  readonly confirmationMessage?: string;
  readonly confirmationAllDevices?: boolean;
  readonly badge?: number;
  readonly badgeLabel?: string;
}

@Component({
  selector: 'app-dashboard-sidebar',
  host: {
    '[class.is-mobile-viewport]': 'mobileViewport()',
    '[style.width]': "mobileViewport() ? '100%' : collapsed() ? '80px' : appearance() === 'editorial' ? '284px' : null",
  },
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard-sidebar.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard-sidebar.scss',
})
export class DashboardSidebarComponent {
  @ViewChild('menuToggle', { read: ElementRef }) private menuToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('drawerClose', { read: ElementRef }) private drawerClose?: ElementRef<HTMLButtonElement>;
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly navItems = input.required<readonly DashboardNavItem[]>();
  readonly appearance = input<'standard' | 'editorial'>('standard');
  readonly brandAppearance = input<'standard' | 'editorial'>('standard');
  readonly navAction = output<DashboardNavItem>();
  protected readonly navigationState = inject(PortalNavigationStateService);
  private readonly logoutDialog = inject(LogoutDialogService);
  private confirmingAction = false;
  protected readonly initials = computed(() => initialsForName(this.title()));
  protected readonly hasEditorialBrand = computed(
    () => this.appearance() === 'editorial' || this.brandAppearance() === 'editorial',
  );
  protected readonly brandRoute = computed(() => {
    const dashboardRoute = this.navItems().find(item => item.icon === 'dashboard' && !item.isAction)?.route;
    return dashboardRoute?.startsWith('/admin/') ? dashboardRoute : '/';
  });
  protected readonly profileRoute = computed(
    () => this.navItems().find(item => item.icon === 'profile' && !item.isAction)?.route ?? '/profile',
  );
  protected readonly isOpen = signal(false);
  protected readonly mobileViewport = signal(typeof window !== 'undefined' && window.innerWidth <= 767);
  protected readonly collapsed = computed(() => this.navigationState.collapsed() && !this.mobileViewport());

  protected toggleCollapsed(): void {
    this.navigationState.toggle();
  }

  protected toggleMenu(): void {
    if (this.isOpen()) this.closeMenu(true);
    else {
      this.isOpen.set(true);
      this.drawerClose?.nativeElement.focus();
    }
  }

  protected closeMenu(restoreFocus = false): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    if (restoreFocus) this.menuToggle?.nativeElement.focus();
  }

  protected async runAction(item: DashboardNavItem): Promise<void> {
    if (item.disabled || this.confirmingAction) return;
    if (item.confirmationMessage) {
      this.confirmingAction = true;
      const confirmed = await this.logoutDialog.confirm(item.confirmationAllDevices ?? false);
      this.confirmingAction = false;
      if (!confirmed) return;
    }
    this.navAction.emit(item);
    this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.closeMenu(true);
  }

  @HostListener('window:resize')
  protected updateViewport(): void {
    this.mobileViewport.set(window.innerWidth <= 767);
    if (!this.mobileViewport()) this.isOpen.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  protected containDrawerFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.mobileViewport() || !this.isOpen()) return;
    const drawer = this.drawerClose?.nativeElement.closest('aside');
    const controls = drawer ? Array.from(drawer.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')) : [];
    if (!controls.length) return;
    const first = controls[0]!;
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
