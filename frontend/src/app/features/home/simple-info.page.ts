import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

@Component({
  selector: 'app-simple-info-page',
  imports: [PublicHeaderComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-public-header />
    <main class="app-page">
      <section class="page-section">
        <div class="page-container">
          <p class="page-kicker">LA Chef</p>
          <h1 class="page-title">{{ title.getTitle().split('|')[0].trim() }}</h1>
          <p class="page-subtitle">
            This informational page shell keeps navigation complete for Phase 1.
          </p>
        </div>
      </section>
    </main>
  `,
})
export class SimpleInfoPageComponent {
  protected readonly title = inject(Title);
}
