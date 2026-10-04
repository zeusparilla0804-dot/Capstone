import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, PublicHeaderComponent],
  template: `
    <app-public-header />
    <main class="not-found" aria-labelledby="not-found-title">
      <p class="page-kicker">Page not found</p>
      <h1 id="not-found-title">We couldn't find that page.</h1>
      <p>The address may have changed, or the page may no longer be available.</p>
      <a class="btn btn-primary" routerLink="/">Return Home</a>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .not-found { display: grid; min-height: calc(100vh - 72px); align-content: center; justify-items: start; gap: 16px; width: min(100% - 40px, 720px); margin: auto; padding: 48px 0; }
    h1 { font-size: clamp(2rem, 5vw, 3.5rem); }
    .not-found > p:not(.page-kicker) { color: var(--color-text-muted); }
  `
})
export class NotFoundPageComponent {}
