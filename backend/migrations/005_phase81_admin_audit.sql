SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.ADMIN_AUDIT_LOG', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ADMIN_AUDIT_LOG (
    audit_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ADMIN_AUDIT_LOG PRIMARY KEY,
    admin_id int NOT NULL,
    action nvarchar(80) NOT NULL,
    entity_type nvarchar(50) NOT NULL,
    entity_id int NOT NULL,
    old_values nvarchar(max) NULL,
    new_values nvarchar(max) NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_ADMIN_AUDIT_LOG_created DEFAULT(sysdatetime()),
    CONSTRAINT FK_ADMIN_AUDIT_LOG_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT CK_ADMIN_AUDIT_LOG_old_json CHECK(old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_ADMIN_AUDIT_LOG_new_json CHECK(new_values IS NULL OR ISJSON(new_values) = 1)
  );

  CREATE INDEX IX_ADMIN_AUDIT_LOG_admin_created ON dbo.ADMIN_AUDIT_LOG(admin_id, created_at DESC);
  CREATE INDEX IX_ADMIN_AUDIT_LOG_entity ON dbo.ADMIN_AUDIT_LOG(entity_type, entity_id, created_at DESC);
END;

COMMIT;
