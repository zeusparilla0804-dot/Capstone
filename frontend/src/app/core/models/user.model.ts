export type UserRole = 'customer' | 'admin';

export interface User {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone?: string;
  readonly role: UserRole;
  readonly avatarUrl?: string;
}

export interface Customer extends User {
  readonly role: 'customer';
}
