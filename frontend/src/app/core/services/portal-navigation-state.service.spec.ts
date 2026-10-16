import { TestBed } from '@angular/core/testing';
import { PortalNavigationStateService } from './portal-navigation-state.service';

describe('PortalNavigationStateService', () => {
  const storageKey = 'la-chef.portal-sidebar-collapsed';

  beforeEach(() => {
    TestBed.resetTestingModule();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  function createService(): PortalNavigationStateService {
    TestBed.configureTestingModule({});
    return TestBed.inject(PortalNavigationStateService);
  }

  it('starts expanded when no saved preference exists', () => {
    expect(createService().collapsed()).toBe(false);
  });

  it('restores only a valid saved collapsed preference', () => {
    window.localStorage.setItem(storageKey, 'true');
    expect(createService().collapsed()).toBe(true);

    TestBed.resetTestingModule();
    window.localStorage.setItem(storageKey, 'invalid');
    expect(createService().collapsed()).toBe(false);
  });

  it('toggles and persists the desktop preference', () => {
    const service = createService();

    service.toggle();
    expect(service.collapsed()).toBe(true);
    expect(window.localStorage.getItem(storageKey)).toBe('true');

    service.setCollapsed(false);
    expect(service.collapsed()).toBe(false);
    expect(window.localStorage.getItem(storageKey)).toBe('false');
  });

  it('continues to work when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    const service = createService();
    expect(service.collapsed()).toBe(false);
    expect(() => service.toggle()).not.toThrow();
    expect(service.collapsed()).toBe(true);
  });
});
