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

  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_price_per_head')
    ALTER TABLE dbo.PACKAGE DROP CONSTRAINT CK_PACKAGE_price_per_head;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_min_guest')
    ALTER TABLE dbo.PACKAGE DROP CONSTRAINT CK_PACKAGE_min_guest;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_max_guest')
    ALTER TABLE dbo.PACKAGE DROP CONSTRAINT CK_PACKAGE_max_guest;
  IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_prices_guests')
    ALTER TABLE dbo.PACKAGE DROP CONSTRAINT CK_PACKAGE_prices_guests;

  IF COL_LENGTH('dbo.PACKAGE', 'pricing_type') IS NULL
    ALTER TABLE dbo.PACKAGE ADD pricing_type varchar(20) NULL;
  IF COL_LENGTH('dbo.PACKAGE', 'base_price') IS NULL
    ALTER TABLE dbo.PACKAGE ADD base_price decimal(12,2) NULL;
  IF COL_LENGTH('dbo.PACKAGE', 'included_guests') IS NULL
    ALTER TABLE dbo.PACKAGE ADD included_guests int NULL;
  IF COL_LENGTH('dbo.PACKAGE', 'excess_guest_price') IS NULL
    ALTER TABLE dbo.PACKAGE ADD excess_guest_price decimal(12,2) NULL;

  EXEC sys.sp_executesql N'UPDATE dbo.PACKAGE SET pricing_type = ''PER_HEAD'' WHERE pricing_type IS NULL;';

  EXEC sys.sp_executesql N'ALTER TABLE dbo.PACKAGE ALTER COLUMN pricing_type varchar(20) NOT NULL;';
  ALTER TABLE dbo.PACKAGE ALTER COLUMN price_per_head decimal(12,2) NULL;
  ALTER TABLE dbo.PACKAGE ALTER COLUMN min_guest int NULL;
  ALTER TABLE dbo.PACKAGE ALTER COLUMN max_guest int NULL;

  IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_PACKAGE_pricing_type')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PACKAGE ADD CONSTRAINT DF_PACKAGE_pricing_type DEFAULT(''PER_HEAD'') FOR pricing_type;';

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_pricing_model')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.PACKAGE WITH CHECK ADD CONSTRAINT CK_PACKAGE_pricing_model CHECK(
      (
        pricing_type = ''PER_HEAD''
        AND price_per_head IS NOT NULL AND price_per_head >= 0
        AND base_price IS NULL
        AND included_guests IS NULL
        AND excess_guest_price IS NULL
      )
      OR
      (
        pricing_type = ''BASE_PLUS_EXCESS''
        AND price_per_head IS NULL
        AND base_price IS NOT NULL AND base_price >= 0
        AND included_guests IS NOT NULL AND included_guests >= 1
        AND excess_guest_price IS NOT NULL AND excess_guest_price >= 0
      )
    );';

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_guest_limits')
    ALTER TABLE dbo.PACKAGE WITH CHECK ADD CONSTRAINT CK_PACKAGE_guest_limits CHECK(
      (min_guest IS NULL OR min_guest >= 1)
      AND (max_guest IS NULL OR max_guest >= 1)
      AND (min_guest IS NULL OR max_guest IS NULL OR max_guest >= min_guest)
    );

  IF COL_LENGTH('dbo.RESERVATION', 'package_name_snapshot') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_name_snapshot nvarchar(150) NULL;
  IF COL_LENGTH('dbo.RESERVATION', 'package_pricing_type') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_pricing_type varchar(20) NULL;
  IF COL_LENGTH('dbo.RESERVATION', 'package_base_price') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_base_price decimal(12,2) NULL;
  IF COL_LENGTH('dbo.RESERVATION', 'package_included_guests') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_included_guests int NULL;
  IF COL_LENGTH('dbo.RESERVATION', 'package_excess_guest_price') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_excess_guest_price decimal(12,2) NULL;
  IF COL_LENGTH('dbo.RESERVATION', 'package_total') IS NULL
    ALTER TABLE dbo.RESERVATION ADD package_total decimal(12,2) NULL;

  IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RESERVATION_package_pricing_snapshot')
    EXEC sys.sp_executesql N'ALTER TABLE dbo.RESERVATION WITH CHECK ADD CONSTRAINT CK_RESERVATION_package_pricing_snapshot CHECK(
      (
        package_pricing_type IS NULL
        AND package_base_price IS NULL
        AND package_included_guests IS NULL
        AND package_excess_guest_price IS NULL
        AND package_total IS NULL
      )
      OR
      (
        package_pricing_type = ''PER_HEAD''
        AND package_unit_price IS NOT NULL
        AND package_base_price IS NULL
        AND package_included_guests IS NULL
        AND package_excess_guest_price IS NULL
        AND package_total IS NOT NULL AND package_total >= 0
      )
      OR
      (
        package_pricing_type = ''BASE_PLUS_EXCESS''
        AND package_unit_price IS NULL
        AND package_base_price IS NOT NULL AND package_base_price >= 0
        AND package_included_guests IS NOT NULL AND package_included_guests >= 1
        AND package_excess_guest_price IS NOT NULL AND package_excess_guest_price >= 0
        AND package_total IS NOT NULL AND package_total >= 0
      )
    );';

  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_PACKAGE_active_event' AND object_id = OBJECT_ID('dbo.PACKAGE')
  )
    EXEC sys.sp_executesql N'CREATE INDEX IX_PACKAGE_active_event ON dbo.PACKAGE(is_active, event_id)
      INCLUDE(pricing_type, price_per_head, base_price, included_guests, excess_guest_price, min_guest, max_guest);';

  COMMIT;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK;
  THROW;
END CATCH;
