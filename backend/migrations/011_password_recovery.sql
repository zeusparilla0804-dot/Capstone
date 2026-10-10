SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.PASSWORD_RESET_TOKEN', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PASSWORD_RESET_TOKEN (
    reset_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PASSWORD_RESET_TOKEN PRIMARY KEY,
    selector char(22) NOT NULL,
    token_hash char(64) NOT NULL,
    principal_type varchar(10) NOT NULL,
    customer_id int NULL,
    admin_id int NULL,
    expires_at datetime2 NOT NULL,
    used_at datetime2 NULL,
    invalidated_at datetime2 NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_PASSWORD_RESET_TOKEN_created DEFAULT(sysutcdatetime()),
    CONSTRAINT UQ_PASSWORD_RESET_TOKEN_selector UNIQUE(selector),
    CONSTRAINT UQ_PASSWORD_RESET_TOKEN_hash UNIQUE(token_hash),
    CONSTRAINT FK_PASSWORD_RESET_TOKEN_CUSTOMER FOREIGN KEY(customer_id) REFERENCES dbo.CUSTOMER(customer_id),
    CONSTRAINT FK_PASSWORD_RESET_TOKEN_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT CK_PASSWORD_RESET_TOKEN_principal CHECK(
      (principal_type = 'CUSTOMER' AND customer_id IS NOT NULL AND admin_id IS NULL)
      OR (principal_type = 'ADMIN' AND admin_id IS NOT NULL AND customer_id IS NULL)
    )
  );

  CREATE INDEX IX_PASSWORD_RESET_TOKEN_customer_created
    ON dbo.PASSWORD_RESET_TOKEN(customer_id, created_at DESC)
    INCLUDE(expires_at, used_at, invalidated_at)
    WHERE customer_id IS NOT NULL;

  CREATE INDEX IX_PASSWORD_RESET_TOKEN_admin_created
    ON dbo.PASSWORD_RESET_TOKEN(admin_id, created_at DESC)
    INCLUDE(expires_at, used_at, invalidated_at)
    WHERE admin_id IS NOT NULL;

  CREATE INDEX IX_PASSWORD_RESET_TOKEN_expiry
    ON dbo.PASSWORD_RESET_TOKEN(expires_at)
    INCLUDE(used_at, invalidated_at);
END;

COMMIT;
