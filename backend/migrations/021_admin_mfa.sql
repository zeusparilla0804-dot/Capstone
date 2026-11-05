SET XACT_ABORT ON;
IF OBJECT_ID('dbo.ADMIN_MFA','U') IS NULL
BEGIN
  CREATE TABLE dbo.ADMIN_MFA (
    admin_id int NOT NULL CONSTRAINT PK_ADMIN_MFA PRIMARY KEY,
    secret_ciphertext varbinary(128) NOT NULL,
    enabled bit NOT NULL CONSTRAINT DF_ADMIN_MFA_enabled DEFAULT(0),
    last_step bigint NULL,
    recovery_code_hashes nvarchar(max) NOT NULL CONSTRAINT CK_ADMIN_MFA_recovery_json CHECK(ISJSON(recovery_code_hashes)=1),
    challenge_hash char(64) NULL,
    challenge_password_hash nvarchar(255) NULL,
    challenge_expires_at datetime2 NULL,
    CONSTRAINT FK_ADMIN_MFA_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id) ON DELETE CASCADE
  );
  DELETE FROM dbo.ADMIN_SESSION;
END;
