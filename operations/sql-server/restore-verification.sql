:on error exit
:setvar SourceDatabaseName "la_chef_staging"
:setvar RestoreDatabaseName "LA_CHEF_RESTORE_VERIFY_YYYYMMDD"
:setvar BackupPath "D:\SQLBackups\la_chef_staging_pre_migration.bak"
:setvar DataLogicalName "replace_with_data_logical_name"
:setvar LogLogicalName "replace_with_log_logical_name"
:setvar RestoreDataPath "D:\SQLData\LA_CHEF_RESTORE_VERIFY_YYYYMMDD.mdf"
:setvar RestoreLogPath "D:\SQLData\LA_CHEF_RESTORE_VERIFY_YYYYMMDD_log.ldf"

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @SourceDatabase sysname = N'$(SourceDatabaseName)';
DECLARE @RestoreDatabase sysname = N'$(RestoreDatabaseName)';
DECLARE @BackupPath nvarchar(4000) = N'$(BackupPath)';
DECLARE @DataLogicalName sysname = N'$(DataLogicalName)';
DECLARE @LogLogicalName sysname = N'$(LogLogicalName)';
DECLARE @RestoreDataPath nvarchar(4000) = N'$(RestoreDataPath)';
DECLARE @RestoreLogPath nvarchar(4000) = N'$(RestoreLogPath)';

IF @RestoreDatabase NOT LIKE N'LA[_]CHEF[_]RESTORE[_]VERIFY[_]%'
  THROW 51020, 'Restore target must use the LA_CHEF_RESTORE_VERIFY_ prefix.', 1;

IF @RestoreDatabase = @SourceDatabase
  THROW 51021, 'Restore verification must never target the source database.', 1;

IF DB_ID(@RestoreDatabase) IS NOT NULL
  THROW 51022, 'Restore target already exists. Choose a new isolated verification database name.', 1;

IF @DataLogicalName LIKE N'replace[_]with[_]%'
   OR @LogLogicalName LIKE N'replace[_]with[_]%'
  THROW 51023, 'Run RESTORE FILELISTONLY and supply the real logical data and log names.', 1;

RESTORE HEADERONLY FROM DISK = @BackupPath;
RESTORE VERIFYONLY FROM DISK = @BackupPath WITH CHECKSUM;
RESTORE FILELISTONLY FROM DISK = @BackupPath;

DECLARE @RestoreSql nvarchar(max) =
  N'RESTORE DATABASE ' + QUOTENAME(@RestoreDatabase)
  + N' FROM DISK = N''' + REPLACE(@BackupPath, N'''', N'''''') + N''''
  + N' WITH MOVE N''' + REPLACE(@DataLogicalName, N'''', N'''''') + N''' TO N'''
  + REPLACE(@RestoreDataPath, N'''', N'''''') + N''','
  + N' MOVE N''' + REPLACE(@LogLogicalName, N'''', N'''''') + N''' TO N'''
  + REPLACE(@RestoreLogPath, N'''', N'''''') + N''','
  + N' CHECKSUM, RECOVERY, STATS = 10;';

EXEC sys.sp_executesql @RestoreSql;

DECLARE @IntegritySql nvarchar(max) =
  N'DBCC CHECKDB (' + QUOTENAME(@RestoreDatabase, N'''') + N') WITH NO_INFOMSGS, ALL_ERRORMSGS;';
EXEC sys.sp_executesql @IntegritySql;

DECLARE @ReadOnlySql nvarchar(max) =
  N'ALTER DATABASE ' + QUOTENAME(@RestoreDatabase)
  + N' SET READ_ONLY WITH ROLLBACK IMMEDIATE;';
EXEC sys.sp_executesql @ReadOnlySql;

SELECT
  @RestoreDatabase AS restored_database,
  state_desc,
  user_access_desc,
  is_read_only
FROM sys.databases
WHERE name = @RestoreDatabase;

-- Keep the verification database read-only until application smoke checks and
-- sampled payment-proof reconciliation are complete. Drop it only through an
-- explicitly approved operator action.
GO
