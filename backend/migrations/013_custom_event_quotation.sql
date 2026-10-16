SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID('dbo.CUSTOM_EVENT_REQUEST', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.CUSTOM_EVENT_REQUEST (
      request_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CUSTOM_EVENT_REQUEST PRIMARY KEY,
      reservation_id int NOT NULL,
      source_package_id int NULL,
      target_budget decimal(12,2) NULL,
      menu_preferences nvarchar(2000) NULL,
      dietary_notes nvarchar(2000) NULL,
      setup_preferences nvarchar(2000) NULL,
      requested_services nvarchar(2000) NULL,
      special_requests nvarchar(2000) NULL,
      status varchar(30) NOT NULL CONSTRAINT DF_CUSTOM_EVENT_REQUEST_status DEFAULT('AWAITING_QUOTE'),
      clarification_reason nvarchar(1000) NULL,
      rejection_reason nvarchar(1000) NULL,
      created_at datetime2 NOT NULL CONSTRAINT DF_CUSTOM_EVENT_REQUEST_created DEFAULT(sysutcdatetime()),
      updated_at datetime2 NOT NULL CONSTRAINT DF_CUSTOM_EVENT_REQUEST_updated DEFAULT(sysutcdatetime()),
      CONSTRAINT UQ_CUSTOM_EVENT_REQUEST_reservation UNIQUE(reservation_id),
      CONSTRAINT FK_CUSTOM_EVENT_REQUEST_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
      CONSTRAINT FK_CUSTOM_EVENT_REQUEST_SOURCE_PACKAGE FOREIGN KEY(source_package_id) REFERENCES dbo.PACKAGE(package_id),
      CONSTRAINT CK_CUSTOM_EVENT_REQUEST_budget CHECK(target_budget IS NULL OR target_budget >= 0),
      CONSTRAINT CK_CUSTOM_EVENT_REQUEST_status CHECK(status IN(
        'AWAITING_QUOTE','NEEDS_CLARIFICATION','QUOTE_SENT','ACCEPTED','DECLINED','REJECTED','EXPIRED'
      ))
    );

    CREATE INDEX IX_CUSTOM_EVENT_REQUEST_status_created
      ON dbo.CUSTOM_EVENT_REQUEST(status, created_at)
      INCLUDE(reservation_id, source_package_id, target_budget, updated_at);
  END;

  IF OBJECT_ID('dbo.CUSTOM_QUOTE', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.CUSTOM_QUOTE (
      quote_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CUSTOM_QUOTE PRIMARY KEY,
      request_id int NOT NULL,
      version int NOT NULL,
      subtotal decimal(12,2) NOT NULL,
      discount_amount decimal(12,2) NOT NULL CONSTRAINT DF_CUSTOM_QUOTE_discount DEFAULT(0),
      total_amount decimal(12,2) NOT NULL,
      required_down_payment decimal(12,2) NOT NULL,
      valid_until date NOT NULL,
      terms nvarchar(4000) NULL,
      status varchar(20) NOT NULL CONSTRAINT DF_CUSTOM_QUOTE_status DEFAULT('DRAFT'),
      sent_by int NULL,
      sent_at datetime2 NULL,
      accepted_at datetime2 NULL,
      declined_at datetime2 NULL,
      created_at datetime2 NOT NULL CONSTRAINT DF_CUSTOM_QUOTE_created DEFAULT(sysutcdatetime()),
      CONSTRAINT UQ_CUSTOM_QUOTE_request_version UNIQUE(request_id,version),
      CONSTRAINT FK_CUSTOM_QUOTE_REQUEST FOREIGN KEY(request_id) REFERENCES dbo.CUSTOM_EVENT_REQUEST(request_id),
      CONSTRAINT FK_CUSTOM_QUOTE_SENDER FOREIGN KEY(sent_by) REFERENCES dbo.ADMIN(admin_id),
      CONSTRAINT CK_CUSTOM_QUOTE_version CHECK(version >= 1),
      CONSTRAINT CK_CUSTOM_QUOTE_amounts CHECK(
        subtotal >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal
        AND total_amount = subtotal - discount_amount
        AND required_down_payment >= 0 AND required_down_payment <= total_amount
      ),
      CONSTRAINT CK_CUSTOM_QUOTE_status CHECK(status IN('DRAFT','SENT','SUPERSEDED','ACCEPTED','DECLINED','EXPIRED'))
    );

    CREATE INDEX IX_CUSTOM_QUOTE_request_status
      ON dbo.CUSTOM_QUOTE(request_id, status)
      INCLUDE(version, total_amount, required_down_payment, valid_until, sent_at, created_at);
  END;

  IF OBJECT_ID('dbo.CUSTOM_QUOTE_ITEM', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.CUSTOM_QUOTE_ITEM (
      quote_item_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_CUSTOM_QUOTE_ITEM PRIMARY KEY,
      quote_id int NOT NULL,
      sort_order int NOT NULL,
      description nvarchar(250) NOT NULL,
      quantity decimal(12,2) NOT NULL,
      unit_price decimal(12,2) NOT NULL,
      line_total decimal(12,2) NOT NULL,
      CONSTRAINT UQ_CUSTOM_QUOTE_ITEM_order UNIQUE(quote_id,sort_order),
      CONSTRAINT FK_CUSTOM_QUOTE_ITEM_QUOTE FOREIGN KEY(quote_id) REFERENCES dbo.CUSTOM_QUOTE(quote_id),
      CONSTRAINT CK_CUSTOM_QUOTE_ITEM_values CHECK(
        sort_order >= 1 AND quantity > 0 AND unit_price >= 0 AND line_total >= 0
      )
    );

    CREATE INDEX IX_CUSTOM_QUOTE_ITEM_quote_order
      ON dbo.CUSTOM_QUOTE_ITEM(quote_id, sort_order)
      INCLUDE(description, quantity, unit_price, line_total);
  END;

  IF COL_LENGTH('dbo.RESERVATION', 'accepted_quote_id') IS NULL
    ALTER TABLE dbo.RESERVATION ADD accepted_quote_id int NULL;

  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_RESERVATION_ACCEPTED_QUOTE')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RESERVATION ADD CONSTRAINT FK_RESERVATION_ACCEPTED_QUOTE FOREIGN KEY(accepted_quote_id) REFERENCES dbo.CUSTOM_QUOTE(quote_id);';

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
