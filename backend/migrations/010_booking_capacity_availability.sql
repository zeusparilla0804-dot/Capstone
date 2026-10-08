SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_RESERVATION_event_capacity'
    AND object_id = OBJECT_ID('dbo.RESERVATION')
)
BEGIN
  CREATE INDEX IX_RESERVATION_event_capacity
    ON dbo.RESERVATION(event_date, status)
    INCLUDE(guest_count);
END;

COMMIT;
