SET XACT_ABORT ON;

IF COL_LENGTH('dbo.PACKAGE', 'menu_key') IS NULL
  ALTER TABLE dbo.PACKAGE ADD menu_key varchar(30) NULL;

-- Backfill once from the existing catalog. Renames never change this link.
-- Dynamic SQL permits adding and using the column in one Azure SQL batch.
EXEC(N'
-- Match the whitespace normalization used by the existing menu resolver.
DECLARE @whitespace nvarchar(24) = NCHAR(9)+NCHAR(10)+NCHAR(11)+NCHAR(12)+NCHAR(13)
  +NCHAR(160)+NCHAR(5760)+NCHAR(8192)+NCHAR(8193)+NCHAR(8194)+NCHAR(8195)
  +NCHAR(8196)+NCHAR(8197)+NCHAR(8198)+NCHAR(8199)+NCHAR(8200)+NCHAR(8201)
  +NCHAR(8202)+NCHAR(8232)+NCHAR(8233)+NCHAR(8239)+NCHAR(8287)+NCHAR(12288)+NCHAR(65279);
DECLARE @names TABLE (package_id int PRIMARY KEY, normalized_name nvarchar(150));
INSERT @names(package_id,normalized_name)
  SELECT package_id,LOWER(TRANSLATE(package_name,@whitespace,REPLICATE(N'' '',LEN(@whitespace))))
  FROM dbo.PACKAGE WHERE menu_key IS NULL;
WHILE EXISTS (SELECT 1 FROM @names WHERE normalized_name LIKE N''%  %'')
  UPDATE @names SET normalized_name=REPLACE(normalized_name,N''  '',N'' '');

UPDATE p SET menu_key = CASE LTRIM(RTRIM(n.normalized_name))
  WHEN ''php 480 per head'' THEN ''classic''
  WHEN ''php 580 per head'' THEN ''expanded''
  WHEN ''php 680 per head'' THEN ''full-buffet''
  WHEN ''amethyst'' THEN ''amethyst'' WHEN ''amethyst package'' THEN ''amethyst''
  WHEN ''diamond'' THEN ''diamond'' WHEN ''diamond package'' THEN ''diamond''
  WHEN ''ruby'' THEN ''ruby'' WHEN ''ruby package'' THEN ''ruby''
  WHEN ''bronze'' THEN ''bronze'' WHEN ''bronze package'' THEN ''bronze''
  WHEN ''silver'' THEN ''silver'' WHEN ''silver package'' THEN ''silver''
  WHEN ''gold'' THEN ''gold'' WHEN ''gold package'' THEN ''gold''
  END FROM dbo.PACKAGE p JOIN @names n ON n.package_id=p.package_id WHERE p.menu_key IS NULL');

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_PACKAGE_menu_key')
  EXEC(N'ALTER TABLE dbo.PACKAGE ADD CONSTRAINT CK_PACKAGE_menu_key
    CHECK (menu_key IS NULL OR menu_key IN (''classic'', ''expanded'', ''full-buffet'',
      ''amethyst'', ''diamond'', ''ruby'', ''bronze'', ''silver'', ''gold''))');
