import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-success-dialog',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './success-dialog.html',
  styleUrl: './success-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.success-dialog--native]': 'nativeModal()' },
})
export class SuccessDialogComponent implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly nativeDialog = viewChild<ElementRef<HTMLDialogElement>>('nativeDialog');
  private readonly primaryAction = viewChild<ElementRef<HTMLElement>>('primaryAction');
  private readonly previouslyFocused = this.document.activeElement as HTMLElement | null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private previousOverflow: string | undefined;

  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly primaryLabel = input.required<string>();
  readonly primaryLink = input('');
  readonly nativeModal = input(false);
  readonly restoreFocusTo = input<HTMLElement | null>(null);
  readonly detailLabel = input('');
  readonly detailValue = input('');
  readonly statusText = input('');
  readonly secondaryLabel = input('');
  readonly secondaryLink = input('');
  readonly dismissed = output<void>();
  protected readonly closing = signal(false);

  constructor() {
    afterNextRender(() => {
      if (this.nativeModal()) {
        this.previousOverflow = this.document.body.style.overflow;
        this.document.body.style.overflow = 'hidden';
        this.nativeDialog()?.nativeElement.showModal();
        this.primaryAction()?.nativeElement.focus();
      } else {
        this.dialog()?.nativeElement.focus();
      }
    });
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.dismiss();
  }

  protected dismiss(): void {
    if (this.closing()) return;
    this.closing.set(true);
    this.dismissTimer = setTimeout(() => this.dismissed.emit(), 160);
  }

  ngOnDestroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    if (this.nativeDialog()?.nativeElement.open) this.nativeDialog()?.nativeElement.close();
    if (this.previousOverflow !== undefined) this.document.body.style.overflow = this.previousOverflow;
    const previous = this.previouslyFocused;
    const target = previous?.isConnected && previous !== this.document.body && previous !== this.document.documentElement
      ? previous : this.restoreFocusTo();
    if (target?.isConnected) target.focus({ preventScroll: true });
  }
}
