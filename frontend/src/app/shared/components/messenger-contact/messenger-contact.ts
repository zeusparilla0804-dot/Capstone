import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterEveryRender, computed, inject, input, signal } from '@angular/core';
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
  private readonly document = inject(DOCUMENT);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private frame: number | null = null;
  protected readonly obscured = signal(false);
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

    const view = this.document.defaultView;
    if (!view) return;
    const schedule = () => {
      if (this.frame !== null || this.destroyRef.destroyed) return;
      this.frame = view.requestAnimationFrame(() => {
        this.frame = null;
        this.checkControls();
      });
    };
    afterEveryRender(schedule);
    view.addEventListener('scroll', schedule, { capture: true, passive: true });
    view.addEventListener('resize', schedule, { passive: true });
    view.visualViewport?.addEventListener('resize', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(this.document.body);
    this.destroyRef.onDestroy(() => {
      if (this.frame !== null) view.cancelAnimationFrame(this.frame);
      view.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      view.visualViewport?.removeEventListener('resize', schedule);
      observer?.disconnect();
    });
  }

  private checkControls(): void {
    if (this.appearance() === 'inline' || !this.visible()) {
      this.obscured.set(false);
      return;
    }
    const link = this.element.nativeElement.querySelector('a');
    if (!link) return;
    const rect = link.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Keep its box measurable while hidden, preventing hide/show oscillation.
    const controls = this.document.querySelectorAll<HTMLElement>('main a,main button,main input,main select,main textarea,main summary,.site-footer a,[role="dialog"],dialog[open]');
    this.obscured.set([...controls].some(control => {
      if (control.checkVisibility?.({ visibilityProperty: true }) === false) return false;
      const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.left < rect.right + 4
        && box.right > rect.left - 4 && box.top < rect.bottom + 4 && box.bottom > rect.top - 4;
    }));
  }
}
