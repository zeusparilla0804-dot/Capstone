import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export interface ActionNotice {
  readonly tone: 'success' | 'error' | 'info';
  readonly title: string;
  readonly message: string;
  readonly centered?: boolean;
}
export interface ActionConfirmation {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly destructive?: boolean;
}

/** One application-wide host; result dialogs survive navigation after a save. */
@Injectable({ providedIn: 'root' })
export class ActionFeedbackService {
  private readonly current = signal<ActionNotice | null>(null);
  private readonly question = signal<ActionConfirmation | null>(null);
  private readonly queue: ActionNotice[] = [];
  private onConfirm: (() => void) | null = null;
  readonly notice = this.current.asReadonly();
  readonly confirmation = this.question.asReadonly();
  constructor() { inject(DestroyRef).onDestroy(() => { this.onConfirm = null; }); }

  show(notice: ActionNotice): void {
    if (this.current()) this.queue.push(notice);
    else this.current.set(notice);
  }

  dismiss(): void { this.current.set(this.queue.shift() ?? null); }

  confirm(question: ActionConfirmation, action: () => void): void {
    if (this.question()) return;
    this.onConfirm = action;
    this.question.set(question);
  }

  decide(confirmed: boolean): void {
    if (!this.question()) return;
    const action = this.onConfirm;
    this.onConfirm = null;
    this.question.set(null);
    if (confirmed) action?.();
  }
}
