import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

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
  private readonly auth = inject(AuthService);
  readonly isAuthenticated = input(false);
  protected readonly authenticated = computed(
    () => this.isAuthenticated() || this.auth.user() !== null,
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
    this.closeMenu();
  }

  protected toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }
}
