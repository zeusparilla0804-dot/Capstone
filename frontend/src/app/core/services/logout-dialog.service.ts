import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApplicationRef, ComponentRef, createComponent, DestroyRef, EnvironmentInjector, inject, Injectable } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { LogoutDialogComponent } from '../../shared/components/logout-dialog/logout-dialog';

@Injectable({ providedIn: 'root' })
export class LogoutDialogService {
  private readonly document = inject(DOCUMENT);
  private readonly app = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private active: { ref: ComponentRef<LogoutDialogComponent>; result: Promise<boolean>; finish: (confirmed: boolean) => void } | null = null;

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.active?.finish(false);
    });
    inject(DestroyRef).onDestroy(() => this.active?.finish(false));
  }

  confirm(allDevices = false, returnFocus?: HTMLElement): Promise<boolean> {
    if (this.active) return this.active.result;
    const previousFocus = returnFocus ?? this.document.activeElement as HTMLElement | null;
    const ref = createComponent(LogoutDialogComponent, { environmentInjector: this.environmentInjector });
    ref.setInput('allDevices', allDevices);
    let resolve!: (confirmed: boolean) => void;
    const result = new Promise<boolean>(done => { resolve = done; });
    const finish = (confirmed: boolean) => {
      if (this.active?.ref !== ref) return;
      this.active = null;
      if (!this.app.destroyed) this.app.detachView(ref.hostView);
      if (!ref.hostView.destroyed) ref.destroy();
      (ref.location.nativeElement as HTMLElement).remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(confirmed);
    };
    this.active = { ref, result, finish };
    ref.instance.decided.subscribe(finish);
    // A body-mounted native modal escapes sidebar stacking contexts and traps focus
    // above the mobile drawer without changing any page layout.
    this.document.body.append(ref.location.nativeElement);
    this.app.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    return result;
  }
}
