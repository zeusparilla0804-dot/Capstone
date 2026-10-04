SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_prices_guests')
  ALTER TABLE dbo.PACKAGE WITH CHECK ADD CONSTRAINT CK_PACKAGE_prices_guests
    CHECK (price_per_head >= 0 AND min_guest >= 1 AND max_guest >= min_guest);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RESERVATION_financials')
  ALTER TABLE dbo.RESERVATION WITH CHECK ADD CONSTRAINT CK_RESERVATION_financials
    CHECK (guest_count > 0 AND package_unit_price >= 0 AND subtotal >= 0 AND discount_amount >= 0 AND total_amount >= 0);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PAYMENT_amounts')
  ALTER TABLE dbo.PAYMENT WITH CHECK ADD CONSTRAINT CK_PAYMENT_amounts
    CHECK (amount_due >= 0 AND amount_paid >= 0 AND amount_paid <= amount_due);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.RESERVATION') AND name = 'IX_RESERVATION_customer_event')
  CREATE INDEX IX_RESERVATION_customer_event ON dbo.RESERVATION(customer_id, event_date DESC) INCLUDE(status, total_amount);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.RESERVATION') AND name = 'IX_RESERVATION_status_created')
  CREATE INDEX IX_RESERVATION_status_created ON dbo.RESERVATION(status, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.PAYMENT_TRANSACTION') AND name = 'UX_PAYMENT_TRANSACTION_reference')
  CREATE UNIQUE INDEX UX_PAYMENT_TRANSACTION_reference
    ON dbo.PAYMENT_TRANSACTION(payment_method, transaction_ref)
    WHERE transaction_ref IS NOT NULL;

COMMIT;
