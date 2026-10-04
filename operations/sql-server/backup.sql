:on error exit
:setvar DatabaseName "la_chef_staging"
:setvar BackupPath "D:\SQLBackups\la_chef_staging_pre_migration.bak"

BACKUP DATABASE [$(DatabaseName)]
TO DISK = N'$(BackupPath)'
WITH COPY_ONLY, CHECKSUM, COMPRESSION, INIT, STATS = 10;

RESTORE VERIFYONLY
FROM DISK = N'$(BackupPath)'
WITH CHECKSUM;
