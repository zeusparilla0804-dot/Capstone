SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.ADMIN_SESSION','U') IS NULL
BEGIN
  CREATE TABLE dbo.ADMIN_SESSION(
    session_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ADMIN_SESSION PRIMARY KEY,
    admin_id int NOT NULL,
    token_hash char(64) NOT NULL,
    expires_at datetime2 NOT NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_ADMIN_SESSION_created DEFAULT(sysdatetime()),
    CONSTRAINT FK_ADMIN_SESSION_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT UQ_ADMIN_SESSION_token UNIQUE(token_hash)
  );
  CREATE INDEX IX_ADMIN_SESSION_admin_expiry ON dbo.ADMIN_SESSION(admin_id,expires_at);
END;

IF OBJECT_ID('dbo.PAYMENT_TRANSACTION','U') IS NULL
BEGIN
  CREATE TABLE dbo.PAYMENT_TRANSACTION(
    payment_transaction_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PAYMENT_TRANSACTION PRIMARY KEY,
    payment_id int NOT NULL,
    admin_id int NOT NULL,
    amount decimal(12,2) NOT NULL,
    payment_method nvarchar(50) NOT NULL,
    transaction_ref nvarchar(150) NULL,
    payment_date datetime2 NOT NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_PAYMENT_TRANSACTION_created DEFAULT(sysdatetime()),
    CONSTRAINT FK_PAYMENT_TRANSACTION_PAYMENT FOREIGN KEY(payment_id) REFERENCES dbo.PAYMENT(payment_id),
    CONSTRAINT FK_PAYMENT_TRANSACTION_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT CK_PAYMENT_TRANSACTION_amount CHECK(amount > 0)
  );
  CREATE INDEX IX_PAYMENT_TRANSACTION_payment_date ON dbo.PAYMENT_TRANSACTION(payment_date DESC);
END;

COMMIT;
