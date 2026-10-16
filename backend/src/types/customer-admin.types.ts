export type CustomerAccountStatus = 'ACTIVE' | 'INACTIVE';

export interface CustomerProfileUpdateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CustomerAdminRecord extends CustomerProfileUpdateInput {
  id: number;
  status: CustomerAccountStatus;
}
