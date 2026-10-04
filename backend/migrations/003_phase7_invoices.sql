SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='INVOICE_NUMBER_SEQUENCE' AND schema_id=SCHEMA_ID('dbo'))
  EXEC('CREATE SEQUENCE dbo.INVOICE_NUMBER_SEQUENCE AS bigint START WITH 1 INCREMENT BY 1 CACHE 20');

IF OBJECT_ID('dbo.INVOICE','U') IS NULL
BEGIN
  CREATE TABLE dbo.INVOICE(
    invoice_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_INVOICE PRIMARY KEY,
    reservation_id int NOT NULL,
    invoice_number nvarchar(30) NOT NULL,
    issued_at datetime2 NOT NULL CONSTRAINT DF_INVOICE_issued DEFAULT(sysdatetime()),
    due_at datetime2 NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_INVOICE_status DEFAULT('ISSUED'),
    subtotal decimal(12,2) NOT NULL,
    discount_amount decimal(12,2) NOT NULL CONSTRAINT DF_INVOICE_discount DEFAULT(0),
    total_amount decimal(12,2) NOT NULL,
    issued_by int NOT NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_INVOICE_created DEFAULT(sysdatetime()),
    CONSTRAINT FK_INVOICE_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT FK_INVOICE_ADMIN FOREIGN KEY(issued_by) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT UQ_INVOICE_reservation UNIQUE(reservation_id),
    CONSTRAINT UQ_INVOICE_number UNIQUE(invoice_number),
    CONSTRAINT CK_INVOICE_status CHECK(status IN('ISSUED','PARTIALLY_PAID','PAID','CANCELLED')),
    CONSTRAINT CK_INVOICE_amounts CHECK(subtotal>=0 AND discount_amount>=0 AND total_amount>=0)
  );
END;

IF OBJECT_ID('dbo.INVOICE_ITEM','U') IS NULL
BEGIN
  CREATE TABLE dbo.INVOICE_ITEM(
    invoice_item_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_INVOICE_ITEM PRIMARY KEY,
    invoice_id int NOT NULL,
    description nvarchar(250) NOT NULL,
    quantity int NOT NULL,
    unit_price decimal(12,2) NOT NULL,
    line_total decimal(12,2) NOT NULL,
    item_type nvarchar(30) NOT NULL,
    CONSTRAINT FK_INVOICE_ITEM_INVOICE FOREIGN KEY(invoice_id) REFERENCES dbo.INVOICE(invoice_id),
    CONSTRAINT CK_INVOICE_ITEM_values CHECK(quantity>0 AND unit_price>=0 AND line_total>=0),
    CONSTRAINT CK_INVOICE_ITEM_type CHECK(item_type IN('PACKAGE','ADD_ON','CHARGE'))
  );
  CREATE INDEX IX_INVOICE_ITEM_invoice ON dbo.INVOICE_ITEM(invoice_id);
END;

COMMIT;
