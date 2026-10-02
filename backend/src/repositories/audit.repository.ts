import sql from 'mssql';
import { getDbPool } from '../config/database.js';

export interface AuditEvent {
  adminId: number;
  action: string;
  entityType: string;
  entityId: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export async function writeAdminAudit(event: AuditEvent, request?: sql.Request): Promise<void> {
  const runner = request ?? (await getDbPool()).request();
  await runner
    .replaceInput('auditAdminId', sql.Int, event.adminId)
    .replaceInput('auditAction', sql.NVarChar(80), event.action)
    .replaceInput('auditEntityType', sql.NVarChar(50), event.entityType)
    .replaceInput('auditEntityId', sql.Int, event.entityId)
    .replaceInput('auditOldValues', sql.NVarChar(sql.MAX), event.oldValues ? JSON.stringify(event.oldValues) : null)
    .replaceInput('auditNewValues', sql.NVarChar(sql.MAX), event.newValues ? JSON.stringify(event.newValues) : null)
    .query(`INSERT dbo.ADMIN_AUDIT_LOG(admin_id,action,entity_type,entity_id,old_values,new_values)
            VALUES(@auditAdminId,@auditAction,@auditEntityType,@auditEntityId,@auditOldValues,@auditNewValues)`);
}
