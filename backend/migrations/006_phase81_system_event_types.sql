SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @event_types TABLE(event_type nvarchar(100) NOT NULL PRIMARY KEY);
INSERT @event_types(event_type) VALUES
  ('Wedding'),
  ('Birthday'),
  ('Corporate'),
  ('Debut'),
  ('Anniversary');

INSERT dbo.EVENT(event_type)
SELECT source.event_type
FROM @event_types source
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.EVENT target WHERE LOWER(target.event_type) = LOWER(source.event_type)
);

COMMIT;
