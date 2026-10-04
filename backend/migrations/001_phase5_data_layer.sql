SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.PACKAGE', 'is_active') IS NULL
  ALTER TABLE dbo.PACKAGE ADD is_active bit NOT NULL CONSTRAINT DF_PACKAGE_is_active DEFAULT (1);

IF COL_LENGTH('dbo.RESERVATION', 'package_id') IS NULL
  ALTER TABLE dbo.RESERVATION ADD package_id int NULL;
IF COL_LENGTH('dbo.RESERVATION', 'booking_reference') IS NULL
  ALTER TABLE dbo.RESERVATION ADD booking_reference nvarchar(30) NULL;
IF COL_LENGTH('dbo.RESERVATION', 'package_unit_price') IS NULL
  ALTER TABLE dbo.RESERVATION ADD package_unit_price decimal(12,2) NULL;
IF COL_LENGTH('dbo.RESERVATION', 'subtotal') IS NULL
  ALTER TABLE dbo.RESERVATION ADD subtotal decimal(12,2) NULL;
IF COL_LENGTH('dbo.RESERVATION', 'discount_amount') IS NULL
  ALTER TABLE dbo.RESERVATION ADD discount_amount decimal(12,2) NOT NULL CONSTRAINT DF_RESERVATION_discount DEFAULT (0);
IF COL_LENGTH('dbo.RESERVATION', 'total_amount') IS NULL
  ALTER TABLE dbo.RESERVATION ADD total_amount decimal(12,2) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_RESERVATION_PACKAGE')
  ALTER TABLE dbo.RESERVATION ADD CONSTRAINT FK_RESERVATION_PACKAGE FOREIGN KEY (package_id) REFERENCES dbo.PACKAGE(package_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_RESERVATION_booking_reference')
  EXEC('CREATE UNIQUE INDEX UX_RESERVATION_booking_reference ON dbo.RESERVATION(booking_reference) WHERE booking_reference IS NOT NULL');

IF OBJECT_ID('dbo.ADD_ON', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ADD_ON (
    add_on_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ADD_ON PRIMARY KEY,
    add_on_name nvarchar(150) NOT NULL,
    description nvarchar(1000) NULL,
    price decimal(12,2) NOT NULL,
    is_active bit NOT NULL CONSTRAINT DF_ADD_ON_is_active DEFAULT (1),
    CONSTRAINT CK_ADD_ON_price CHECK (price >= 0),
    CONSTRAINT UQ_ADD_ON_name UNIQUE (add_on_name)
  );
END;

IF OBJECT_ID('dbo.RESERVATION_ADD_ON', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.RESERVATION_ADD_ON (
    reservation_id int NOT NULL,
    add_on_id int NOT NULL,
    unit_price decimal(12,2) NOT NULL,
    CONSTRAINT PK_RESERVATION_ADD_ON PRIMARY KEY (reservation_id, add_on_id),
    CONSTRAINT FK_RESERVATION_ADD_ON_RESERVATION FOREIGN KEY (reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT FK_RESERVATION_ADD_ON_ADD_ON FOREIGN KEY (add_on_id) REFERENCES dbo.ADD_ON(add_on_id),
    CONSTRAINT CK_RESERVATION_ADD_ON_price CHECK (unit_price >= 0)
  );
END;

IF OBJECT_ID('dbo.AUTH_SESSION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AUTH_SESSION (
    session_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_AUTH_SESSION PRIMARY KEY,
    customer_id int NOT NULL,
    token_hash char(64) NOT NULL,
    expires_at datetime2 NOT NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_AUTH_SESSION_created DEFAULT (sysdatetime()),
    CONSTRAINT FK_AUTH_SESSION_CUSTOMER FOREIGN KEY (customer_id) REFERENCES dbo.CUSTOMER(customer_id),
    CONSTRAINT UQ_AUTH_SESSION_token_hash UNIQUE (token_hash)
  );
  CREATE INDEX IX_AUTH_SESSION_customer_expiry ON dbo.AUTH_SESSION(customer_id, expires_at);
END;

COMMIT;
