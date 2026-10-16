import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BookingService } from '../../core/services/booking.service';
import { CustomEventService } from '../../core/services/custom-event.service';
import { PackageService } from '../../core/services/package.service';
import { CustomEventPage } from './custom-event.page';

describe('CustomEventPage', () => {
  it('submits one separate quotation request and keeps payment out of the form', async () => {
    localStorage.removeItem('lachef.custom-event-draft');
    let finish!: (value: unknown) => void;
    const submit = vi.fn(() => new Promise(resolve => { finish = resolve; })) as any;
    TestBed.configureTestingModule({
      imports: [CustomEventPage], providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ sourcePackage: '4' }) } } },
        { provide: PackageService, useValue: { load: vi.fn(), packages: signal([]), getPackageById: () => ({ id: '4', name: 'Ruby Package' }) } },
        { provide: BookingService, useValue: { checkAvailability: () => of({ date: '2098-10-20', guestCount: 120, status: 'AVAILABLE', activeBookingCount: 0, capacityLimit: 6, remainingRequestSlots: 5, requiresAdminConfirmation: false, message: 'Available' }) } },
        { provide: CustomEventService, useValue: { submit } },
      ],
    });
    const fixture = TestBed.createComponent(CustomEventPage);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ eventType: 'Wedding', eventDate: '2098-10-20', eventTime: '18:00', venue: 'Panorama Ville', guestCount: 120 });
    await new Promise(resolve => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No payment yet');
    expect(fixture.nativeElement.textContent).toContain('Ruby Package');
    const first = component.submit();
    const second = component.submit();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].sourcePackageId).toBe(4);
    expect(submit.mock.calls[0][0].paymentMethod).toBeUndefined();
    finish({ id: 12 });
    await Promise.all([first, second]);
  });
});
