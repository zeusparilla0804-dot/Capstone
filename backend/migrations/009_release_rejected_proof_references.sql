SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.PAYMENT_PROOF', 'archived_transaction_reference') IS NULL
BEGIN
  ALTER TABLE dbo.PAYMENT_PROOF
    ADD archived_transaction_reference nvarchar(150) NULL;
END;

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID('dbo.PAYMENT_PROOF')
    AND name = 'CK_PAYMENT_PROOF_reference'
)
BEGIN
  ALTER TABLE dbo.PAYMENT_PROOF DROP CONSTRAINT CK_PAYMENT_PROOF_reference;
END;

EXEC sys.sp_executesql N'
  UPDATE dbo.PAYMENT_PROOF
  SET archived_transaction_reference = transaction_reference,
      transaction_reference = NULL,
      updated_at = SYSUTCDATETIME()
  WHERE status IN(''REJECTED'', ''SUPERSEDED'')
    AND transaction_reference IS NOT NULL;
';

EXEC sys.sp_executesql N'
  ALTER TABLE dbo.PAYMENT_PROOF WITH CHECK
    ADD CONSTRAINT CK_PAYMENT_PROOF_reference CHECK(
      method = ''CASH''
      OR transaction_reference IS NOT NULL
      OR archived_transaction_reference IS NOT NULL
    );
';

COMMIT;
