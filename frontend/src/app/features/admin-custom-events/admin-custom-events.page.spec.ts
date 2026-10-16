import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { PageResult } from '../../core/models';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminService } from '../../core/services/admin.service';
import { AdminCustomEventsPage } from './admin-custom-events.page';

const emptyPage: PageResult<never> = {
  items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0,
};

describe('AdminCustomEventsPage', () => {
  let fixture: ComponentFixture<AdminCustomEventsPage>;
  let result: Subject<unknown>;
  let api: { customEvents: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    result = new Subject();
    api = { customEvents: vi.fn(() => result.asObservable()) };
    await TestBed.configureTestingModule({
      imports: [AdminCustomEventsPage],
      providers: [
        provideRouter([]),
        { provide: AdminService, useValue: api },
        { provide: AdminAuthService, useValue: { user: signal({ fullName: 'Admin' }), logout: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminCustomEventsPage);
    fixture.detectChanges();
  });

  it('shows loading and empty states while preserving filter values', () => {
    expect(fixture.nativeElement.textContent).toContain('Loading custom requests');
    const component = fixture.componentInstance as unknown as { search: string; status: string; load(page: number): void };
    component.search = 'LC-204';
    component.status = 'AWAITING_QUOTE';
    result.next({ success: true, data: emptyPage });
    result.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No custom requests match these filters');
    component.load(1);
    expect(api.customEvents).toHaveBeenLastCalledWith({
      page: 1, pageSize: 20, search: 'LC-204', status: 'AWAITING_QUOTE',
    });
  });

  it('shows a recoverable error state', () => {
    result.error(new Error('offline'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unable to load custom event requests');
    expect(fixture.nativeElement.textContent).toContain('Try again');
  });
});
