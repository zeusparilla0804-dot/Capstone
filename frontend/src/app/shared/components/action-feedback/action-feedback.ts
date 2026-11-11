import { DOCUMENT } from '@angular/common';
import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { ActionFeedbackService } from '../../../core/services/action-feedback.service';

@Component({
  selector: 'app-action-feedback',
  templateUrl: './action-feedback.html',
  styleUrl: './action-feedback.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionFeedbackComponent {
  protected readonly feedback = inject(ActionFeedbackService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly content = computed(() => this.feedback.confirmation() ?? this.feedback.notice());
  private previousFocus: HTMLElement | null = null;
  private previousOverflow: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const content = this.content();
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (content && !dialog.open) {
        this.previousFocus = this.document.activeElement as HTMLElement | null;
        this.previousOverflow = this.document.body.style.overflow;
        this.document.body.style.overflow = 'hidden';
        dialog.showModal();
        // Default to the safe choice, especially when recording or rejecting a payment.
        dialog.querySelector<HTMLButtonElement>('[data-feedback-safe]')?.focus();
      } else if (!content && dialog.open) this.closeDialog();
    });
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.feedback.decide(false);
    });
    inject(DestroyRef).onDestroy(() => {
      this.closeDialog();
    });
  }

  protected decide(confirmed: boolean): void {
    // Close and restore focus before a synchronous HTTP result can open the next dialog.
    this.closeDialog();
    this.feedback.decide(confirmed);
  }
  protected dismiss(): void { this.closeDialog(); this.feedback.dismiss(); }
  protected escape(event: Event): void {
    event.preventDefault();
    if (this.feedback.confirmation()) this.decide(false);
    else this.dismiss();
  }

  private closeDialog(): void {
    const dialog = this.dialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    if (this.previousOverflow !== null) {
      this.document.body.style.overflow = this.previousOverflow;
      this.previousOverflow = null;
      if (this.previousFocus?.isConnected) this.previousFocus.focus();
      this.previousFocus = null;
    }
  }

}
