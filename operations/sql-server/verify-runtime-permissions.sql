:on error exit
:setvar DatabaseName "la_chef_staging"
:setvar RuntimeLogin "la_chef_staging_app"

USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ExpectedLogin sysname = N'$(RuntimeLogin)';

IF ORIGINAL_LOGIN() <> @ExpectedLogin
  THROW 51100, 'Permission verification must run while authenticated as the configured runtime login.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'SELECT'), 0) <> 1
  THROW 51101, 'Runtime login is missing SELECT on dbo.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'INSERT'), 0) <> 1
  THROW 51102, 'Runtime login is missing INSERT on dbo.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'UPDATE'), 0) <> 1
  THROW 51103, 'Runtime login is missing UPDATE on dbo.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'DELETE'), 0) <> 1
  THROW 51104, 'Runtime login is missing DELETE on dbo.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(N'dbo', N'SCHEMA', N'EXECUTE'), 0) <> 1
  THROW 51105, 'Runtime login is missing EXECUTE on dbo.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CREATE TABLE'), 0) <> 0
  THROW 51106, 'Runtime login must not create tables.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER'), 0) <> 0
  THROW 51107, 'Runtime login must not alter the database.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL'), 0) <> 0
  THROW 51108, 'Runtime login must not control the database.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'TAKE OWNERSHIP'), 0) <> 0
  THROW 51109, 'Runtime login must not take database ownership.', 1;

IF COALESCE(IS_SRVROLEMEMBER(N'sysadmin'), 0) <> 0
  THROW 51110, 'Runtime login must not be a sysadmin.', 1;

IF COALESCE(IS_SRVROLEMEMBER(N'dbcreator'), 0) <> 0
  THROW 51111, 'Runtime login must not be a dbcreator.', 1;

IF COALESCE(IS_SRVROLEMEMBER(N'securityadmin'), 0) <> 0
  THROW 51112, 'Runtime login must not be a securityadmin.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'CREATE ANY DATABASE'), 0) <> 0
  THROW 51113, 'Runtime login must not create databases.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'ALTER ANY DATABASE'), 0) <> 0
  THROW 51114, 'Runtime login must not alter databases.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'ALTER ANY LOGIN'), 0) <> 0
  THROW 51115, 'Runtime login must not manage logins.', 1;

IF COALESCE(HAS_PERMS_BY_NAME(NULL, NULL, N'CONTROL SERVER'), 0) <> 0
  THROW 51116, 'Runtime login must not control the server.', 1;

SELECT TOP (0) reservation_id
FROM dbo.RESERVATION;

SELECT
  N'PASS' AS permission_status,
  ORIGINAL_LOGIN() AS runtime_login,
  DB_NAME() AS database_name;
GO
