import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  afterNextRender,
  Component,
  computed,
  effect,
  HostListener,
  ElementRef,
  Injector,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LogoutDialogService } from '../../../core/services/logout-dialog.service';
import { initialsForName } from '../../utils/user-display';

interface PublicNavItem {
  readonly label: string;
  readonly route: string;
  readonly showActiveState?: boolean;
}

@Component({
  selector: 'app-public-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './public-header.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './public-header.scss',
})
export class PublicHeaderComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly logoutDialog = inject(LogoutDialogService);
  private confirmingLogout = false;
  private readonly accountArea = viewChild<ElementRef<HTMLElement>>('accountArea');
  private readonly accountTrigger = viewChild<ElementRef<HTMLButtonElement>>('accountTrigger');
  protected readonly isAccountOpen = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly auth = inject(AuthService);
  readonly isAuthenticated = input(false);
  readonly appearance = input<'default' | 'auth'>('default');
  protected readonly authenticated = computed(
    () => this.isAuthenticated() || this.auth.user() !== null,
  );
  protected readonly customerInitials = computed(() =>
    initialsForName(this.auth.user()?.fullName),
  );
  protected readonly isMenuOpen = signal(false);
  protected readonly navItems: readonly PublicNavItem[] = [
    { label: 'Home', route: '/' },
    { label: 'Packages', route: '/packages' },
    { label: 'Events', route: '/events' },
    { label: 'About', route: '/about' },
    { label: 'Contact', route: '/contact' },
  ];

  constructor() {
    void this.auth.ensureAuthenticated();

    effect((onCleanup) => {
      if (!this.isMenuOpen()) return;
      const previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      onCleanup(() => {
        this.document.body.style.overflow = previousOverflow;
      });
    });
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    if (this.isAccountOpen()) {
      this.isAccountOpen.set(false);
      this.accountTrigger()?.nativeElement.focus();
      return;
    }
    this.closeMenu();
  }

  @HostListener('document:click', ['$event'])
  protected closeAccountOutside(event: MouseEvent): void {
    if (!this.accountArea()?.nativeElement.contains(event.target as Node)) this.isAccountOpen.set(false);
  }

  protected toggleAccount(): void { this.isAccountOpen.update(open => !open); }

  protected onAccountFocusOut(event: FocusEvent): void {
    if (!this.accountArea()?.nativeElement.contains(event.relatedTarget as Node | null)) this.isAccountOpen.set(false);
  }

  protected onAccountKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focusItem = () => {
      const items = Array.from(this.accountArea()?.nativeElement.querySelectorAll<HTMLElement>('.public-header__account-menu a, .public-header__account-menu button:not(:disabled)') ?? []);
      if (!items.length) return;
      const index = items.indexOf(this.document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length);
      items[next]?.focus();
    };
    if (this.isAccountOpen()) focusItem();
    else {
      this.isAccountOpen.set(true);
      afterNextRender(focusItem, { injector: this.injector });
    }
  }

  protected async logout(): Promise<void> {
    if (this.signingOut() || this.confirmingLogout) return;
    this.confirmingLogout = true;
    const confirmed = await this.logoutDialog.confirm(false, this.accountTrigger()?.nativeElement);
    this.confirmingLogout = false;
    if (!confirmed) return;
    this.signingOut.set(true);
    try { await this.auth.logout(); }
    finally {
      this.closeMenu();
      this.signingOut.set(false);
      await this.router.navigate(['/']);
    }
  }

  protected toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this.isAccountOpen.set(false);
    this.isMenuOpen.set(false);
  }
}
