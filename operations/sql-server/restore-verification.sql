:on error exit
:setvar BackupPath "D:\SQLBackups\la_chef_staging_pre_migration.bak"

RESTORE HEADERONLY FROM DISK = N'$(BackupPath)';
RESTORE VERIFYONLY FROM DISK = N'$(BackupPath)' WITH CHECKSUM;

-- A full restore test needs environment-specific MOVE destinations. Obtain logical
-- names with RESTORE FILELISTONLY, then restore to a new non-production database.
RESTORE FILELISTONLY FROM DISK = N'$(BackupPath)';
