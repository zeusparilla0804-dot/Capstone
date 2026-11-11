import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CustomerNotificationsService } from '../../../core/services/customer-notifications.service';
let notificationBellId = 0;

@Component({ selector: 'app-notification-bell', imports: [RouterLink, DatePipe],
  templateUrl: './notification-bell.html', styleUrl: './notification-bell.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class NotificationBellComponent {
  protected readonly panelId = `customer-notifications-${++notificationBellId}`;
  protected readonly updates = inject(CustomerNotificationsService);
  private readonly auth = inject(AuthService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly open = signal(false);
  constructor() {
    effect(onCleanup => {
      if (!this.auth.user()) { this.open.set(false); return; }
      untracked(() => this.updates.refresh());
      const timer = setInterval(() => this.updates.refresh(), 30_000);
      onCleanup(() => clearInterval(timer));
    });
  }
  protected toggle(): void { this.open.update(value => !value); if (this.open()) this.updates.refresh(); }
  protected visit(id: string): void { this.updates.markRead([id]); this.open.set(false); }
  protected routePath(link: string): string { return link.split('?')[0]!; }
  protected routeQuery(link: string): Record<string, string> { return Object.fromEntries(new URLSearchParams(link.split('?')[1] ?? '')); }
  @HostListener('window:focus') protected refreshOnFocus(): void { if (this.auth.user()) this.updates.refresh(); }
  @HostListener('document:click', ['$event']) protected outside(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
  @HostListener('document:keydown.escape') protected escape(): void {
    if (this.open()) { this.open.set(false); this.trigger()?.nativeElement.focus(); }
  }
  protected focusOut(event: FocusEvent): void {
    if (!this.element.nativeElement.contains(event.relatedTarget as Node | null)) this.open.set(false);
  }
}
