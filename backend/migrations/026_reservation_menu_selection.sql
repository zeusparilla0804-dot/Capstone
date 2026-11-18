SET XACT_ABORT ON;

IF COL_LENGTH('dbo.RESERVATION', 'menu_selection_json') IS NULL
  ALTER TABLE dbo.RESERVATION ADD menu_selection_json nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RESERVATION_menu_selection_json')
  EXEC(N'ALTER TABLE dbo.RESERVATION ADD CONSTRAINT CK_RESERVATION_menu_selection_json
    CHECK (menu_selection_json IS NULL OR ISJSON(menu_selection_json) = 1)');
