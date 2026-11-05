SET XACT_ABORT ON;
IF COL_LENGTH('dbo.CUSTOMER','requires_email_verification') IS NULL
  ALTER TABLE dbo.CUSTOMER ADD requires_email_verification bit NOT NULL
    CONSTRAINT DF_CUSTOMER_requires_email_verification DEFAULT(0) WITH VALUES;
IF COL_LENGTH('dbo.CUSTOMER','email_verified_at') IS NULL
  ALTER TABLE dbo.CUSTOMER ADD email_verified_at datetime2 NULL;
IF COL_LENGTH('dbo.CUSTOMER','verified_email') IS NULL
  ALTER TABLE dbo.CUSTOMER ADD verified_email nvarchar(255) NULL;

IF OBJECT_ID('dbo.EMAIL_VERIFICATION_CHALLENGE','U') IS NULL
BEGIN
  CREATE TABLE dbo.EMAIL_VERIFICATION_CHALLENGE (
    customer_id int NOT NULL CONSTRAINT PK_EMAIL_VERIFICATION_CHALLENGE PRIMARY KEY,
    selector char(22) NOT NULL CONSTRAINT UQ_EMAIL_VERIFICATION_CHALLENGE_selector UNIQUE,
    email nvarchar(255) NOT NULL,
    code_hash char(64) NOT NULL,
    attempts int NOT NULL CONSTRAINT CK_EMAIL_VERIFICATION_CHALLENGE_attempts CHECK(attempts BETWEEN 0 AND 5),
    created_at datetime2 NOT NULL,
    expires_at datetime2 NOT NULL,
    window_started_at datetime2 NOT NULL,
    issuance_count int NOT NULL CONSTRAINT CK_EMAIL_VERIFICATION_CHALLENGE_issuances CHECK(issuance_count BETWEEN 1 AND 5),
    locked_until datetime2 NULL,
    CONSTRAINT FK_EMAIL_VERIFICATION_CHALLENGE_CUSTOMER FOREIGN KEY(customer_id) REFERENCES dbo.CUSTOMER(customer_id) ON DELETE CASCADE
  );
  CREATE INDEX IX_EMAIL_VERIFICATION_CHALLENGE_expiry ON dbo.EMAIL_VERIFICATION_CHALLENGE(expires_at);
END;
