import { customerAdminRepository } from '../repositories/customer-admin.repository.js';
import type {
  CustomerAccountStatus,
  CustomerAdminRecord,
  CustomerProfileUpdateInput,
} from '../types/customer-admin.types.js';
import { AppError } from '../utils/app-error.js';
import { emailAddress, identifier, text } from '../utils/validation.js';

interface CustomerAdminServiceDependencies {
  updateProfile(
    adminId: number,
    customerId: number,
    input: CustomerProfileUpdateInput,
  ): Promise<CustomerAdminRecord | undefined>;
  setStatus(
    adminId: number,
    customerId: number,
    status: CustomerAccountStatus,
  ): Promise<CustomerAdminRecord | undefined>;
}

function inputObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'number' in error
    && [2601, 2627].includes(Number((error as { number: unknown }).number));
}

export function createCustomerAdminService(deps: CustomerAdminServiceDependencies) {
  return {
    async updateProfile(adminIdRaw: unknown, customerIdRaw: unknown, raw: unknown) {
      const adminId = identifier(adminIdRaw, 'Administrator identifier');
      const customerId = identifier(customerIdRaw, 'Customer identifier');
      const value = inputObject(raw);
      const input: CustomerProfileUpdateInput = {
        firstName: text(value['firstName'], 'First name', { max: 100 }),
        lastName: text(value['lastName'], 'Last name', { max: 100 }),
        email: emailAddress(value['email']),
        phone: text(value['phone'], 'Phone', { max: 30 }),
      };
      try {
        const result = await deps.updateProfile(adminId, customerId, input);
        if (!result) throw new AppError(404, 'Customer not found.');
        return result;
      } catch (error) {
        if (duplicateKey(error)) throw new AppError(409, 'Email is already in use.');
        throw error;
      }
    },

    async setStatus(adminIdRaw: unknown, customerIdRaw: unknown, rawStatus: unknown) {
      const adminId = identifier(adminIdRaw, 'Administrator identifier');
      const customerId = identifier(customerIdRaw, 'Customer identifier');
      if (typeof rawStatus !== 'string') throw new AppError(400, 'Customer status is invalid.');
      const status = rawStatus.trim().toUpperCase();
      if (status !== 'ACTIVE' && status !== 'INACTIVE') throw new AppError(400, 'Customer status is invalid.');
      const result = await deps.setStatus(adminId, customerId, status);
      if (!result) throw new AppError(404, 'Customer not found.');
      return result;
    },
  };
}

export const customerAdminService = createCustomerAdminService(customerAdminRepository);
