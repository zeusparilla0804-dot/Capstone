import { Component, computed, ElementRef, HostListener, ViewChild, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { initialsForName } from '../../utils/user-display';

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
  @ViewChild('menuToggle', { read: ElementRef }) private menuToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('drawerClose', { read: ElementRef }) private drawerClose?: ElementRef<HTMLButtonElement>;
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly navItems = input.required<readonly DashboardNavItem[]>();
  readonly navAction = output<DashboardNavItem>();
  protected readonly initials = computed(() => initialsForName(this.title()));
  protected readonly isOpen = signal(false);
  protected readonly mobileViewport = signal(typeof window !== 'undefined' && window.innerWidth <= 767);

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

  protected runAction(item: DashboardNavItem): void {
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
