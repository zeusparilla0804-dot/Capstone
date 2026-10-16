import { Injectable, signal } from '@angular/core';

const sidebarPreferenceKey = 'la-chef.portal-sidebar-collapsed';

@Injectable({ providedIn: 'root' })
export class PortalNavigationStateService {
  private readonly collapsedState = signal(this.readPreference());
  readonly collapsed = this.collapsedState.asReadonly();

  toggle(): void {
    this.setCollapsed(!this.collapsedState());
  }

  setCollapsed(value: boolean): void {
    this.collapsedState.set(value);
    try {
      window.localStorage.setItem(sidebarPreferenceKey, String(value));
    } catch {
      // The visual preference remains usable when storage is blocked.
    }
  }

  private readPreference(): boolean {
    try {
      return window.localStorage.getItem(sidebarPreferenceKey) === 'true';
    } catch {
      return false;
    }
  }
}
