import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge, startWith, switchMap, timer } from 'rxjs';

const IDLE_DELAY_MS = 5 * 60_000;
const DEFERRED_CHECK_MS = 30_000;

export function refreshPageAfterIdle(destroyRef: DestroyRef, canRefresh: () => boolean): void {
  merge(
    fromEvent(document, 'pointerdown'),
    fromEvent(document, 'keydown'),
    fromEvent(document, 'input'),
    fromEvent(document, 'change'),
    fromEvent(document, 'scroll', { capture: true, passive: true }),
    fromEvent(document, 'visibilitychange'),
    fromEvent(window, 'focus'),
  ).pipe(
    startWith(null),
    switchMap(() => timer(IDLE_DELAY_MS, DEFERRED_CHECK_MS)),
    takeUntilDestroyed(destroyRef),
  ).subscribe(() => {
    if (document.visibilityState === 'visible' && canRefresh()) window.location.reload();
  });
}
