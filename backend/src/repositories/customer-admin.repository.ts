import sql from 'mssql';

import { getDbPool } from '../config/database.js';
import { writeAdminAudit, type AuditEvent } from './audit.repository.js';
import type {
  CustomerAccountStatus,
  CustomerAdminRecord,
  CustomerProfileUpdateInput,
} from '../types/customer-admin.types.js';

interface CustomerAdminRepositoryDependencies {
  transaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T>;
  audit(event: AuditEvent, request?: sql.Request): Promise<void>;
}

function mapCustomer(row: Record<string, unknown>): CustomerAdminRecord {
  return {
    id: Number(row['id']),
    firstName: String(row['firstName']),
    lastName: String(row['lastName']),
    email: String(row['email']),
    phone: String(row['phone']),
    status: String(row['status']) as CustomerAccountStatus,
  };
}

async function lockedCustomer(request: sql.Request, customerId: number): Promise<CustomerAdminRecord | undefined> {
  const result = await request
    .replaceInput('customerId', sql.Int, customerId)
    .query<Record<string, unknown>>(`SELECT customer_id id,first_name firstName,last_name lastName,
      email,contact_number phone,status FROM dbo.CUSTOMER WITH(UPDLOCK,HOLDLOCK)
      WHERE customer_id=@customerId`);
  return result.recordset[0] ? mapCustomer(result.recordset[0]) : undefined;
}

export function createCustomerAdminRepository(deps: CustomerAdminRepositoryDependencies) {
  return {
    updateProfile(adminId: number, customerId: number, input: CustomerProfileUpdateInput) {
      return deps.transaction(async (request) => {
        const current = await lockedCustomer(request, customerId);
        if (!current) return undefined;

        await request
          .replaceInput('firstName', sql.NVarChar(100), input.firstName)
          .replaceInput('lastName', sql.NVarChar(100), input.lastName)
          .replaceInput('email', sql.NVarChar(255), input.email)
          .replaceInput('phone', sql.NVarChar(30), input.phone)
          .query(`UPDATE dbo.CUSTOMER SET first_name=@firstName,last_name=@lastName,
            email=@email,contact_number=@phone WHERE customer_id=@customerId`);

        if (current.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
          await request.query(`UPDATE dbo.PASSWORD_RESET_TOKEN SET invalidated_at=SYSUTCDATETIME()
            WHERE principal_type='CUSTOMER' AND customer_id=@customerId
              AND used_at IS NULL AND invalidated_at IS NULL`);
        }

        await deps.audit({
          adminId,
          action: 'CUSTOMER_UPDATED',
          entityType: 'CUSTOMER',
          entityId: customerId,
          oldValues: {
            firstName: current.firstName,
            lastName: current.lastName,
            email: current.email,
            phone: current.phone,
          },
          newValues: { ...input },
        }, request);

        return { ...current, ...input };
      });
    },

    setStatus(adminId: number, customerId: number, status: CustomerAccountStatus) {
      return deps.transaction(async (request) => {
        const current = await lockedCustomer(request, customerId);
        if (!current) return undefined;

        if (current.status !== status) {
          await request
            .replaceInput('status', sql.NVarChar(20), status)
            .query('UPDATE dbo.CUSTOMER SET status=@status WHERE customer_id=@customerId');
        }

        if (status === 'INACTIVE') {
          await request.query('DELETE dbo.AUTH_SESSION WHERE customer_id=@customerId');
        }

        if (current.status !== status) {
          await deps.audit({
            adminId,
            action: status === 'INACTIVE' ? 'CUSTOMER_DEACTIVATED' : 'CUSTOMER_ACTIVATED',
            entityType: 'CUSTOMER',
            entityId: customerId,
            oldValues: { status: current.status },
            newValues: { status },
          }, request);
        }

        return { ...current, status };
      });
    },
  };
}

async function customerAdminTransaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const result = await work(new sql.Request(transaction));
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  }
}

export const customerAdminRepository = createCustomerAdminRepository({
  transaction: customerAdminTransaction,
  audit: writeAdminAudit,
});
