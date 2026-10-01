SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.PAYMENT_PROOF', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PAYMENT_PROOF (
    payment_proof_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PAYMENT_PROOF PRIMARY KEY,
    reservation_id int NOT NULL,
    customer_id int NOT NULL,
    payment_id int NULL,
    payment_transaction_id bigint NULL,
    invoice_id int NULL,
    method nvarchar(30) NOT NULL,
    claimed_amount decimal(12,2) NOT NULL,
    transaction_reference nvarchar(150) NULL,
    payment_date datetime2 NOT NULL,
    storage_key nvarchar(500) NOT NULL,
    original_filename nvarchar(255) NOT NULL,
    mime_type nvarchar(100) NOT NULL,
    byte_size bigint NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_PAYMENT_PROOF_status DEFAULT('SUBMITTED'),
    rejection_reason nvarchar(1000) NULL,
    reviewed_by int NULL,
    reviewed_at datetime2 NULL,
    verified_amount decimal(12,2) NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_PAYMENT_PROOF_created DEFAULT(sysutcdatetime()),
    updated_at datetime2 NOT NULL CONSTRAINT DF_PAYMENT_PROOF_updated DEFAULT(sysutcdatetime()),
    CONSTRAINT FK_PAYMENT_PROOF_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT FK_PAYMENT_PROOF_CUSTOMER FOREIGN KEY(customer_id) REFERENCES dbo.CUSTOMER(customer_id),
    CONSTRAINT FK_PAYMENT_PROOF_PAYMENT FOREIGN KEY(payment_id) REFERENCES dbo.PAYMENT(payment_id),
    CONSTRAINT FK_PAYMENT_PROOF_TRANSACTION FOREIGN KEY(payment_transaction_id) REFERENCES dbo.PAYMENT_TRANSACTION(payment_transaction_id),
    CONSTRAINT FK_PAYMENT_PROOF_INVOICE FOREIGN KEY(invoice_id) REFERENCES dbo.INVOICE(invoice_id),
    CONSTRAINT FK_PAYMENT_PROOF_REVIEWER FOREIGN KEY(reviewed_by) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT CK_PAYMENT_PROOF_method CHECK(method IN('CASH','BANK_TRANSFER','E_WALLET')),
    CONSTRAINT CK_PAYMENT_PROOF_status CHECK(status IN('SUBMITTED','VERIFIED','REJECTED','SUPERSEDED')),
    CONSTRAINT CK_PAYMENT_PROOF_amount CHECK(claimed_amount > 0 AND (verified_amount IS NULL OR verified_amount > 0)),
    CONSTRAINT CK_PAYMENT_PROOF_byte_size CHECK(byte_size > 0 AND byte_size <= 5242880),
    CONSTRAINT CK_PAYMENT_PROOF_reference CHECK(method = 'CASH' OR transaction_reference IS NOT NULL),
    CONSTRAINT CK_PAYMENT_PROOF_review CHECK(
      (status IN('SUBMITTED','SUPERSEDED') AND reviewed_by IS NULL AND reviewed_at IS NULL AND verified_amount IS NULL AND rejection_reason IS NULL)
      OR (status = 'VERIFIED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND verified_amount IS NOT NULL AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL AND verified_amount IS NULL)
    )
  );

  CREATE UNIQUE INDEX UX_PAYMENT_PROOF_active_reference
    ON dbo.PAYMENT_PROOF(transaction_reference)
    WHERE transaction_reference IS NOT NULL;
  CREATE INDEX IX_PAYMENT_PROOF_status_created
    ON dbo.PAYMENT_PROOF(status, created_at) INCLUDE(reservation_id, customer_id, claimed_amount);
  CREATE INDEX IX_PAYMENT_PROOF_reservation_created
    ON dbo.PAYMENT_PROOF(reservation_id, created_at DESC);
END;

IF OBJECT_ID('dbo.BOOKING_STATUS_HISTORY', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BOOKING_STATUS_HISTORY (
    booking_status_history_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_BOOKING_STATUS_HISTORY PRIMARY KEY,
    reservation_id int NOT NULL,
    previous_status nvarchar(40) NULL,
    next_status nvarchar(40) NOT NULL,
    actor_type nvarchar(20) NOT NULL,
    actor_id int NULL,
    reason nvarchar(1000) NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_BOOKING_STATUS_HISTORY_created DEFAULT(sysutcdatetime()),
    CONSTRAINT FK_BOOKING_STATUS_HISTORY_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT CK_BOOKING_STATUS_HISTORY_actor CHECK(actor_type IN('CUSTOMER','ADMIN','SYSTEM')),
    CONSTRAINT CK_BOOKING_STATUS_HISTORY_actor_id CHECK((actor_type = 'SYSTEM' AND actor_id IS NULL) OR (actor_type IN('CUSTOMER','ADMIN') AND actor_id IS NOT NULL))
  );

  CREATE INDEX IX_BOOKING_STATUS_HISTORY_reservation_created
    ON dbo.BOOKING_STATUS_HISTORY(reservation_id, created_at DESC);
END;

IF OBJECT_ID('dbo.EMAIL_OUTBOX', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EMAIL_OUTBOX (
    notification_id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_EMAIL_OUTBOX PRIMARY KEY,
    recipient nvarchar(320) NOT NULL,
    normalized_recipient nvarchar(320) NOT NULL,
    template_key nvarchar(80) NOT NULL,
    payload nvarchar(max) NOT NULL,
    related_entity_type nvarchar(50) NULL,
    related_entity_id bigint NULL,
    status nvarchar(20) NOT NULL CONSTRAINT DF_EMAIL_OUTBOX_status DEFAULT('PENDING'),
    attempt_count int NOT NULL CONSTRAINT DF_EMAIL_OUTBOX_attempt_count DEFAULT(0),
    next_attempt_at datetime2 NULL,
    last_error nvarchar(2000) NULL,
    created_at datetime2 NOT NULL CONSTRAINT DF_EMAIL_OUTBOX_created DEFAULT(sysutcdatetime()),
    sent_at datetime2 NULL,
    updated_at datetime2 NOT NULL CONSTRAINT DF_EMAIL_OUTBOX_updated DEFAULT(sysutcdatetime()),
    CONSTRAINT CK_EMAIL_OUTBOX_payload CHECK(ISJSON(payload) = 1),
    CONSTRAINT CK_EMAIL_OUTBOX_status CHECK(status IN('PENDING','PROCESSING','SENT','FAILED')),
    CONSTRAINT CK_EMAIL_OUTBOX_attempt_count CHECK(attempt_count >= 0),
    CONSTRAINT CK_EMAIL_OUTBOX_related_entity CHECK(
      (related_entity_type IS NULL AND related_entity_id IS NULL)
      OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL)
    ),
    CONSTRAINT CK_EMAIL_OUTBOX_sent_at CHECK((status = 'SENT' AND sent_at IS NOT NULL) OR (status <> 'SENT' AND sent_at IS NULL))
  );

  CREATE INDEX IX_EMAIL_OUTBOX_status_next_attempt
    ON dbo.EMAIL_OUTBOX(status, next_attempt_at, created_at) INCLUDE(attempt_count);
  CREATE INDEX IX_EMAIL_OUTBOX_related_entity
    ON dbo.EMAIL_OUTBOX(related_entity_type, related_entity_id, created_at DESC);
END;

COMMIT;
