IF OBJECT_ID('dbo.CUSTOMER_NOTIFICATION_READ', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CUSTOMER_NOTIFICATION_READ (
    customer_id int NOT NULL REFERENCES dbo.CUSTOMER(customer_id),
    notification_key nvarchar(120) NOT NULL,
    read_at datetime2 NOT NULL DEFAULT(sysutcdatetime()),
    CONSTRAINT PK_CUSTOMER_NOTIFICATION_READ PRIMARY KEY(customer_id, notification_key)
  );
END;

IF OBJECT_ID('dbo.PACKAGE_IMAGE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PACKAGE_IMAGE (
    image_id int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    package_id int NOT NULL REFERENCES dbo.PACKAGE(package_id),
    sort_order int NOT NULL,
    asset_path nvarchar(300) NULL,
    image_mime nvarchar(30) NULL,
    image_bytes varbinary(max) NULL,
    CONSTRAINT CK_PACKAGE_IMAGE_source CHECK (
      (asset_path IS NOT NULL AND image_bytes IS NULL AND image_mime IS NULL)
      OR (asset_path IS NULL AND image_bytes IS NOT NULL AND image_mime IS NOT NULL)
    ),
    CONSTRAINT UQ_PACKAGE_IMAGE_order UNIQUE(package_id, sort_order)
  );
END;
