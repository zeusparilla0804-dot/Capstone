import { Component, HostListener, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface DashboardNavItem {
  readonly label: string;
  readonly route: string;
  readonly icon?: 'dashboard' | 'calendar' | 'wallet' | 'profile' | 'mail' | 'audit' | 'catalog' | 'logout';
  readonly isAction?: boolean;
  readonly showActiveState?: boolean;
}

@Component({
  selector: 'app-dashboard-sidebar',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './dashboard-sidebar.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard-sidebar.scss',
})
export class DashboardSidebarComponent {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly navItems = input.required<readonly DashboardNavItem[]>();
  readonly navAction = output<DashboardNavItem>();
  protected readonly isOpen = signal(false);

  protected toggleMenu(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this.isOpen.set(false);
  }

  protected runAction(item: DashboardNavItem): void {
    this.navAction.emit(item);
    this.closeMenu();
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.closeMenu();
  }
}
