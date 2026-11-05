SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- No policy rows are invented for existing reservations. They require review on read.
IF OBJECT_ID('dbo.BOOKING_POLICY','U') IS NULL
BEGIN
  CREATE TABLE dbo.BOOKING_POLICY(
    reservation_id int NOT NULL,
    policy_version int NOT NULL CONSTRAINT DF_BOOKING_POLICY_version DEFAULT(2),
    stage nvarchar(30) NOT NULL,
    event_start_at datetime2 NOT NULL,
    preparation_hours int NOT NULL,
    preparation_cutoff_at datetime2 NOT NULL,
    review_target_at datetime2 NOT NULL,
    approved_for_payment_at datetime2 NULL,
    payment_due_at datetime2 NULL,
    verification_due_at datetime2 NULL,
    hold_status nvarchar(20) NOT NULL,
    review_required bit NOT NULL,
    review_reason nvarchar(100) NULL,
    exception_approved_by int NULL,
    exception_reason nvarchar(1000) NULL,
    exception_deadline datetime2 NULL,
    preparation_exception_acknowledged bit NOT NULL CONSTRAINT DF_BOOKING_POLICY_preparation_exception DEFAULT(0),
    updated_at datetime2 NOT NULL CONSTRAINT DF_BOOKING_POLICY_updated DEFAULT(SYSUTCDATETIME()),
    CONSTRAINT PK_BOOKING_POLICY PRIMARY KEY(reservation_id),
    CONSTRAINT FK_BOOKING_POLICY_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT FK_BOOKING_POLICY_APPROVER FOREIGN KEY(exception_approved_by) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT CK_BOOKING_POLICY_version CHECK(policy_version > 0),
    CONSTRAINT CK_BOOKING_POLICY_stage CHECK(stage IN('PENDING_REVIEW','SHORT_NOTICE_REVIEW','AWAITING_PAYMENT','CONFIRMED','EXPIRED','MANUAL_REVIEW')),
    CONSTRAINT CK_BOOKING_POLICY_hold CHECK(hold_status IN('NONE','HELD','CONFIRMED','RELEASED')),
    CONSTRAINT CK_BOOKING_POLICY_preparation CHECK(preparation_hours > 0 AND preparation_cutoff_at <= event_start_at)
  );
END;

IF EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.RESERVATION') AND name='CK_RESERVATION_status' AND definition NOT LIKE '%''EXPIRED''%')
  ALTER TABLE dbo.RESERVATION DROP CONSTRAINT CK_RESERVATION_status;
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.RESERVATION') AND name='CK_RESERVATION_status')
  ALTER TABLE dbo.RESERVATION WITH CHECK ADD CONSTRAINT CK_RESERVATION_status CHECK(status IN(
    'PENDING','APPROVED','REJECTED','AWAITING_PAYMENT','PAYMENT_SUBMITTED',
    'PAYMENT_VERIFIED','CONFIRMED','CANCELLED','COMPLETED','EXPIRED'
  ));

IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.BOOKING_POLICY') AND name='IX_BOOKING_POLICY_payment_due')
  CREATE INDEX IX_BOOKING_POLICY_payment_due ON dbo.BOOKING_POLICY(stage,payment_due_at) INCLUDE(hold_status,review_required);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.BOOKING_POLICY') AND name='IX_BOOKING_POLICY_review_target')
  CREATE INDEX IX_BOOKING_POLICY_review_target ON dbo.BOOKING_POLICY(stage,review_target_at) INCLUDE(review_required);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.BOOKING_POLICY') AND name='IX_BOOKING_POLICY_verification_due')
  CREATE INDEX IX_BOOKING_POLICY_verification_due ON dbo.BOOKING_POLICY(verification_due_at) INCLUDE(stage,preparation_cutoff_at,hold_status);

COMMIT;
