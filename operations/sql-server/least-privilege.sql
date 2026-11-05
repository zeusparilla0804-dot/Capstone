:on error exit
:setvar DatabaseName "la_chef_staging"
:setvar RuntimeLogin "la_chef_staging_app"
:setvar MigrationLogin "la_chef_staging_migrator"

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @RuntimeLogin sysname = N'$(RuntimeLogin)';
DECLARE @MigrationLogin sysname = N'$(MigrationLogin)';

IF SUSER_ID(@RuntimeLogin) IS NULL
  THROW 51000, 'Runtime login does not exist. Provision it through the secret-managed infrastructure first.', 1;

IF SUSER_ID(@MigrationLogin) IS NULL
  THROW 51001, 'Migration login does not exist. Provision it through the secret-managed infrastructure first.', 1;

IF IS_SRVROLEMEMBER(N'sysadmin', @RuntimeLogin) = 1
   OR IS_SRVROLEMEMBER(N'dbcreator', @RuntimeLogin) = 1
   OR IS_SRVROLEMEMBER(N'securityadmin', @RuntimeLogin) = 1
  THROW 51002, 'Runtime login must not be sysadmin, dbcreator, or securityadmin.', 1;

IF IS_SRVROLEMEMBER(N'sysadmin', @MigrationLogin) = 1
   OR IS_SRVROLEMEMBER(N'dbcreator', @MigrationLogin) = 1
   OR IS_SRVROLEMEMBER(N'securityadmin', @MigrationLogin) = 1
  THROW 51003, 'Migration login must not be sysadmin, dbcreator, or securityadmin.', 1;

IF EXISTS (
  SELECT 1
  FROM sys.server_permissions AS permission
  INNER JOIN sys.server_principals AS principal
    ON principal.principal_id = permission.grantee_principal_id
  WHERE principal.name IN (@RuntimeLogin, @MigrationLogin)
    AND permission.state IN ('G', 'W')
    AND permission.permission_name IN (
      'ALTER ANY DATABASE',
      'ALTER ANY LOGIN',
      'CONTROL SERVER',
      'CREATE ANY DATABASE'
    )
)
  THROW 51004, 'Application principals must not hold database-provisioning server permissions.', 1;

DECLARE @Sql nvarchar(max);

IF USER_ID(@RuntimeLogin) IS NULL
BEGIN
  SET @Sql = N'CREATE USER ' + QUOTENAME(@RuntimeLogin)
    + N' FOR LOGIN ' + QUOTENAME(@RuntimeLogin) + N';';
  EXEC sys.sp_executesql @Sql;
END;

IF USER_ID(@MigrationLogin) IS NULL
BEGIN
  SET @Sql = N'CREATE USER ' + QUOTENAME(@MigrationLogin)
    + N' FOR LOGIN ' + QUOTENAME(@MigrationLogin) + N';';
  EXEC sys.sp_executesql @Sql;
END;

IF DATABASE_PRINCIPAL_ID(N'la_chef_runtime') IS NULL
  CREATE ROLE [la_chef_runtime];

IF DATABASE_PRINCIPAL_ID(N'la_chef_migration') IS NULL
  CREATE ROLE [la_chef_migration];

GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[dbo] TO [la_chef_runtime];
GRANT EXECUTE ON SCHEMA::[dbo] TO [la_chef_runtime];
GRANT VIEW DEFINITION TO [la_chef_runtime];
IF OBJECT_ID('dbo.AUTH_SECURITY_EVENT','U') IS NOT NULL
  DENY UPDATE, DELETE ON OBJECT::dbo.AUTH_SECURITY_EVENT TO [la_chef_runtime];
DENY ALTER, CONTROL, TAKE OWNERSHIP TO [la_chef_runtime];
DENY CREATE FUNCTION, CREATE PROCEDURE, CREATE TABLE, CREATE VIEW TO [la_chef_runtime];

GRANT EXECUTE ON SCHEMA::[dbo] TO [la_chef_migration];
GRANT VIEW DEFINITION TO [la_chef_migration];

SET @Sql = N'ALTER ROLE [la_chef_runtime] ADD MEMBER ' + QUOTENAME(@RuntimeLogin) + N';';
IF IS_ROLEMEMBER(N'la_chef_runtime', @RuntimeLogin) <> 1
  EXEC sys.sp_executesql @Sql;

SET @Sql = N'ALTER ROLE [la_chef_migration] ADD MEMBER ' + QUOTENAME(@MigrationLogin) + N';';
IF IS_ROLEMEMBER(N'la_chef_migration', @MigrationLogin) <> 1
  EXEC sys.sp_executesql @Sql;

IF IS_ROLEMEMBER(N'db_datareader', @MigrationLogin) <> 1
BEGIN
  SET @Sql = N'ALTER ROLE [db_datareader] ADD MEMBER ' + QUOTENAME(@MigrationLogin) + N';';
  EXEC sys.sp_executesql @Sql;
END;

IF IS_ROLEMEMBER(N'db_datawriter', @MigrationLogin) <> 1
BEGIN
  SET @Sql = N'ALTER ROLE [db_datawriter] ADD MEMBER ' + QUOTENAME(@MigrationLogin) + N';';
  EXEC sys.sp_executesql @Sql;
END;

IF IS_ROLEMEMBER(N'db_ddladmin', @MigrationLogin) <> 1
BEGIN
  SET @Sql = N'ALTER ROLE [db_ddladmin] ADD MEMBER ' + QUOTENAME(@MigrationLogin) + N';';
  EXEC sys.sp_executesql @Sql;
END;

SELECT
  principal.name AS database_principal,
  role_principal.name AS role_name
FROM sys.database_role_members AS membership
INNER JOIN sys.database_principals AS role_principal
  ON role_principal.principal_id = membership.role_principal_id
INNER JOIN sys.database_principals AS principal
  ON principal.principal_id = membership.member_principal_id
WHERE principal.name IN (@RuntimeLogin, @MigrationLogin)
ORDER BY principal.name, role_principal.name;
GO
