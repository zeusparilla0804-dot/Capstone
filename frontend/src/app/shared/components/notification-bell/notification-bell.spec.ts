import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationBellComponent } from './notification-bell';

describe('Customer notification bell filters', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NotificationBellComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ id: '42' }) } },
    ] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotificationBellComponent); fixture.detectChanges();
    http.expectOne(request => request.url.endsWith('/notifications')).flush({ data: [] });
    fixture.nativeElement.querySelector('.notifications__trigger').click();
    http.expectOne(request => request.url.endsWith('/notifications')).flush({ data: [
      { id: 'email:1', type: 'PAYMENT_RECORDED', title: 'Payment recorded', message: 'Payment update', reference: 'BK-42', createdAt: '2026-11-08', isRead: true, link: '/my-bookings' },
      { id: 'email:2', type: 'BOOKING_APPROVED', title: 'Booking approved', message: 'Reservation update', reference: 'BK-42', createdAt: '2026-11-08', isRead: false, link: '/my-bookings' },
    ] }); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('combines read status and type without hiding the global unread badge or marking records read', () => {
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('[data-notification-filter="read"]')!.click();
    const category = root.querySelector<HTMLSelectElement>('[aria-label="Notification type"]')!;
    category.value = 'payments'; category.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(root.querySelectorAll('li')).toHaveLength(1); expect(root.querySelector('li')?.textContent).toContain('Payment recorded');
    expect(root.querySelector('.notifications__trigger')?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
    category.value = 'reservations'; category.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(root.querySelectorAll('li')).toHaveLength(0); expect(root.textContent).toContain('No notifications match these filters.');
    root.querySelector<HTMLButtonElement>('[data-notification-filter="unread"]')!.click(); fixture.detectChanges();
    expect(root.querySelectorAll('li')).toHaveLength(1); expect(root.querySelector('li')?.textContent).toContain('Booking approved');
    expect([...category.options].map(option => option.text)).toEqual(['All types', 'Reservations', 'Payments']);
    http.expectNone(request => request.method === 'POST');
  });
});
