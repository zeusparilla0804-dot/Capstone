import { customerNavItems } from './customer-navigation';

describe('Customer navigation badges', () => {
  it('shows outstanding payment records independently from current reservations', () => {
    const items = (customerNavItems as any)(3, 2);
    expect(items.find((item: any) => item.route === '/my-bookings').badge).toBe(3);
    expect(items.find((item: any) => item.route === '/billing')).toMatchObject({ badge: 2, badgeLabel: 'reservations with outstanding payments' });
  });
});
