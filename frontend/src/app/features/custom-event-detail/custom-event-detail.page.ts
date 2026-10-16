import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { CustomEventDetail, CustomEventStatus, CustomQuote } from '../../core/models';
import { CustomEventService } from '../../core/services/custom-event.service';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

@Component({
  selector: 'app-custom-event-detail-page',
  imports: [CurrencyPipe, DatePipe, FormsModule, PublicHeaderComponent, RouterLink],
  templateUrl: './custom-event-detail.page.html',
  styleUrl: './custom-event-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CustomEventDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CustomEventService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly request = signal<CustomEventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly decision = signal<'accept' | 'decline' | null>(null);
  protected readonly acting = signal(false);
  protected readonly actionError = signal('');
  protected declineReason = '';
  private readonly requestId = Number(this.route.snapshot.paramMap.get('id'));
  protected readonly quote = computed<CustomQuote | null>(() => this.request()?.currentQuote ?? null);

  constructor() { this.load(); }

  protected statusLabel(status: CustomEventStatus): string {
    return ({ AWAITING_QUOTE: 'Waiting for quotation', NEEDS_CLARIFICATION: 'Needs clarification', QUOTE_SENT: 'Quotation ready',
      ACCEPTED: 'Accepted', DECLINED: 'Declined', REJECTED: 'Request declined', EXPIRED: 'Expired' } as const)[status];
  }

  protected openDecision(value: 'accept' | 'decline'): void {
    if (this.acting()) return;
    this.actionError.set(''); this.declineReason = ''; this.decision.set(value);
  }

  protected closeDecision(): void { if (!this.acting()) this.decision.set(null); }

  protected async confirmDecision(): Promise<void> {
    const quote = this.quote(); const decision = this.decision();
    if (!quote || !decision || this.acting()) return;
    this.acting.set(true); this.actionError.set('');
    try {
      if (decision === 'accept') await this.service.accept(this.requestId, quote.id);
      else await this.service.decline(this.requestId, quote.id, this.declineReason.trim() || undefined);
      this.decision.set(null); this.load();
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'error' in error
        ? (error as { error?: { message?: string } }).error?.message : undefined;
      this.actionError.set(message ?? 'This quotation could not be updated. Refresh and try again.');
    } finally { this.acting.set(false); }
  }

  private load(): void {
    if (!Number.isSafeInteger(this.requestId) || this.requestId < 1) {
      this.loading.set(false); this.error.set('Custom event request not found.'); return;
    }
    this.loading.set(true); this.error.set('');
    this.service.detail(this.requestId).pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: request => this.request.set(request),
      error: () => this.error.set('We could not load this custom event request.'),
    });
  }
}
