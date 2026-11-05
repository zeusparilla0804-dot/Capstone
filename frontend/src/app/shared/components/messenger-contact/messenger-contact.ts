import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../../environments/environment';

function secureUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-messenger-contact',
  templateUrl: './messenger-contact.html',
  styleUrl: './messenger-contact.scss',
  host: { '[class.is-inline]': 'appearance() === "inline"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessengerContactComponent {
  readonly appearance = input<'floating' | 'inline'>('floating');
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentUrl = signal(this.router.url);
  protected readonly messengerUrl = secureUrl(environment.messengerUrl);
  protected readonly visible = computed(() => {
    const path = this.currentUrl().split(/[?#]/, 1)[0] ?? '';
    return this.messengerUrl !== null && (this.appearance() === 'inline' || (path !== '/contact' && !path.startsWith('/admin')));
  });

  constructor() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(event => this.currentUrl.set(event.urlAfterRedirects));
  }
}
