:on error exit
:setvar DatabaseName "la_chef_staging"
:setvar BackupPath "D:\SQLBackups\la_chef_staging_pre_migration.bak"

SET NOCOUNT ON;

IF DB_ID(N'$(DatabaseName)') IS NULL
  THROW 51010, 'The requested backup database does not exist.', 1;

BACKUP DATABASE [$(DatabaseName)]
TO DISK = N'$(BackupPath)'
WITH
  COPY_ONLY,
  CHECKSUM,
  COMPRESSION,
  INIT,
  NAME = N'$(DatabaseName) pre-deployment backup',
  DESCRIPTION = N'LA Chef coordinated release backup. Pair with the matching private proof-storage snapshot.',
  STATS = 10;

RESTORE VERIFYONLY
FROM DISK = N'$(BackupPath)'
WITH CHECKSUM;

RESTORE HEADERONLY
FROM DISK = N'$(BackupPath)';
