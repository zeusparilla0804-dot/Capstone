SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.CUSTOMER', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CUSTOMER (
    customer_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_CUSTOMER PRIMARY KEY,
    first_name nvarchar(100) NOT NULL,
    last_name nvarchar(100) NOT NULL,
    email nvarchar(255) NOT NULL,
    contact_number nvarchar(30) NOT NULL,
    address nvarchar(500) NULL,
    password nvarchar(255) NOT NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_CUSTOMER_created_at DEFAULT(sysdatetime()),
    CONSTRAINT UQ_CUSTOMER_email UNIQUE(email)
  );
END;

IF OBJECT_ID('dbo.ADMIN', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ADMIN (
    admin_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ADMIN PRIMARY KEY,
    username nvarchar(100) NOT NULL,
    password nvarchar(255) NOT NULL,
    full_name nvarchar(200) NOT NULL,
    role nvarchar(50) NOT NULL,
    contact_number nvarchar(30) NULL,
    email nvarchar(255) NOT NULL,
    status nvarchar(20) NOT NULL CONSTRAINT DF_ADMIN_status DEFAULT('ACTIVE'),
    CONSTRAINT UQ_ADMIN_username UNIQUE(username),
    CONSTRAINT UQ_ADMIN_email UNIQUE(email),
    CONSTRAINT CK_ADMIN_status CHECK(status IN('ACTIVE','INACTIVE'))
  );
END;

IF OBJECT_ID('dbo.EVENT', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EVENT (
    event_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_EVENT PRIMARY KEY,
    event_type nvarchar(100) NOT NULL,
    description nvarchar(1000) NULL,
    CONSTRAINT UQ_EVENT_event_type UNIQUE(event_type)
  );
END;

IF OBJECT_ID('dbo.PACKAGE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PACKAGE (
    package_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PACKAGE PRIMARY KEY,
    event_id int NOT NULL,
    package_name nvarchar(150) NOT NULL,
    description nvarchar(1000) NULL,
    price_per_head decimal(12,2) NOT NULL,
    min_guest int NOT NULL,
    max_guest int NOT NULL,
    CONSTRAINT FK_PACKAGE_EVENT FOREIGN KEY(event_id) REFERENCES dbo.EVENT(event_id),
    CONSTRAINT UQ_PACKAGE_event_name UNIQUE(event_id, package_name),
    CONSTRAINT CK_PACKAGE_price_per_head CHECK(price_per_head >= 0),
    CONSTRAINT CK_PACKAGE_min_guest CHECK(min_guest > 0),
    CONSTRAINT CK_PACKAGE_max_guest CHECK(max_guest >= min_guest)
  );
  CREATE INDEX IX_PACKAGE_event_id ON dbo.PACKAGE(event_id);
END;

IF OBJECT_ID('dbo.MENU_ITEM', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MENU_ITEM (
    menu_item_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_MENU_ITEM PRIMARY KEY,
    package_id int NOT NULL,
    item_name nvarchar(150) NOT NULL,
    category nvarchar(100) NOT NULL,
    description nvarchar(1000) NULL,
    CONSTRAINT FK_MENU_ITEM_PACKAGE FOREIGN KEY(package_id) REFERENCES dbo.PACKAGE(package_id),
    CONSTRAINT UQ_MENU_ITEM_package_item UNIQUE(package_id, item_name)
  );
  CREATE INDEX IX_MENU_ITEM_package_id ON dbo.MENU_ITEM(package_id);
END;

IF OBJECT_ID('dbo.RESERVATION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.RESERVATION (
    reservation_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_RESERVATION PRIMARY KEY,
    customer_id int NOT NULL,
    event_id int NOT NULL,
    event_date date NOT NULL,
    event_time time(0) NOT NULL,
    guest_count int NOT NULL,
    venue_address nvarchar(500) NOT NULL,
    special_request nvarchar(2000) NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_RESERVATION_status DEFAULT('PENDING'),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_RESERVATION_created_at DEFAULT(sysdatetime()),
    CONSTRAINT FK_RESERVATION_CUSTOMER FOREIGN KEY(customer_id) REFERENCES dbo.CUSTOMER(customer_id),
    CONSTRAINT FK_RESERVATION_EVENT FOREIGN KEY(event_id) REFERENCES dbo.EVENT(event_id),
    CONSTRAINT CK_RESERVATION_guest_count CHECK(guest_count > 0),
    CONSTRAINT CK_RESERVATION_status CHECK(status IN(
      'PENDING','APPROVED','REJECTED','AWAITING_PAYMENT','PAYMENT_SUBMITTED',
      'PAYMENT_VERIFIED','CONFIRMED','CANCELLED','COMPLETED'
    ))
  );
  CREATE INDEX IX_RESERVATION_customer_id ON dbo.RESERVATION(customer_id);
  CREATE INDEX IX_RESERVATION_event_id ON dbo.RESERVATION(event_id);
  CREATE INDEX IX_RESERVATION_event_date ON dbo.RESERVATION(event_date);
  CREATE INDEX IX_RESERVATION_status ON dbo.RESERVATION(status);
END;

IF OBJECT_ID('dbo.PAYMENT', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PAYMENT (
    payment_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PAYMENT PRIMARY KEY,
    reservation_id int NOT NULL,
    admin_id int NULL,
    amount_due decimal(12,2) NOT NULL,
    amount_paid decimal(12,2) NOT NULL CONSTRAINT DF_PAYMENT_amount_paid DEFAULT(0),
    payment_method nvarchar(50) NULL,
    payment_date datetime2(0) NULL,
    transaction_ref nvarchar(150) NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_PAYMENT_status DEFAULT('PENDING'),
    CONSTRAINT FK_PAYMENT_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT FK_PAYMENT_ADMIN FOREIGN KEY(admin_id) REFERENCES dbo.ADMIN(admin_id),
    CONSTRAINT UQ_PAYMENT_reservation UNIQUE(reservation_id),
    CONSTRAINT CK_PAYMENT_amount_due CHECK(amount_due >= 0),
    CONSTRAINT CK_PAYMENT_amount_paid CHECK(amount_paid >= 0),
    CONSTRAINT CK_PAYMENT_method CHECK(payment_method IS NULL OR payment_method IN('CASH','BANK_TRANSFER','E-WALLET')),
    CONSTRAINT CK_PAYMENT_status CHECK(status IN('PENDING','SUBMITTED','VERIFIED','REJECTED','PARTIALLY_PAID','PAID'))
  );
  CREATE INDEX IX_PAYMENT_admin_id ON dbo.PAYMENT(admin_id);
  CREATE INDEX IX_PAYMENT_status ON dbo.PAYMENT(status);
END;

IF OBJECT_ID('dbo.NOTIFICATION', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NOTIFICATION (
    notification_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_NOTIFICATION PRIMARY KEY,
    reservation_id int NOT NULL,
    recipient_type nvarchar(30) NOT NULL,
    recipient_id int NOT NULL,
    message nvarchar(max) NOT NULL,
    status nvarchar(30) NOT NULL CONSTRAINT DF_NOTIFICATION_status DEFAULT('PENDING'),
    sent_at datetime2(0) NULL,
    CONSTRAINT FK_NOTIFICATION_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT CK_NOTIFICATION_recipient_type CHECK(recipient_type IN('CUSTOMER','ADMIN')),
    CONSTRAINT CK_NOTIFICATION_status CHECK(status IN('PENDING','SENT','FAILED'))
  );
  CREATE INDEX IX_NOTIFICATION_reservation_id ON dbo.NOTIFICATION(reservation_id);
END;

DECLARE @violations TABLE (
  violation nvarchar(1000) NOT NULL
);

DECLARE @expected_columns TABLE (
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  type_name sysname NOT NULL,
  max_length smallint NOT NULL,
  precision_value tinyint NOT NULL,
  scale_value tinyint NOT NULL,
  is_nullable bit NOT NULL,
  is_identity bit NOT NULL,
  PRIMARY KEY(table_name, column_name)
);

INSERT @expected_columns(table_name,column_name,type_name,max_length,precision_value,scale_value,is_nullable,is_identity) VALUES
  ('CUSTOMER','customer_id','int',4,10,0,0,1),
  ('CUSTOMER','first_name','nvarchar',200,0,0,0,0),
  ('CUSTOMER','last_name','nvarchar',200,0,0,0,0),
  ('CUSTOMER','email','nvarchar',510,0,0,0,0),
  ('CUSTOMER','contact_number','nvarchar',60,0,0,0,0),
  ('CUSTOMER','address','nvarchar',1000,0,0,1,0),
  ('CUSTOMER','password','nvarchar',510,0,0,0,0),
  ('CUSTOMER','created_at','datetime2',6,19,0,0,0),
  ('ADMIN','admin_id','int',4,10,0,0,1),
  ('ADMIN','username','nvarchar',200,0,0,0,0),
  ('ADMIN','password','nvarchar',510,0,0,0,0),
  ('ADMIN','full_name','nvarchar',400,0,0,0,0),
  ('ADMIN','role','nvarchar',100,0,0,0,0),
  ('ADMIN','contact_number','nvarchar',60,0,0,1,0),
  ('ADMIN','email','nvarchar',510,0,0,0,0),
  ('ADMIN','status','nvarchar',40,0,0,0,0),
  ('EVENT','event_id','int',4,10,0,0,1),
  ('EVENT','event_type','nvarchar',200,0,0,0,0),
  ('EVENT','description','nvarchar',2000,0,0,1,0),
  ('PACKAGE','package_id','int',4,10,0,0,1),
  ('PACKAGE','event_id','int',4,10,0,0,0),
  ('PACKAGE','package_name','nvarchar',300,0,0,0,0),
  ('PACKAGE','description','nvarchar',2000,0,0,1,0),
  ('PACKAGE','price_per_head','decimal',9,12,2,0,0),
  ('PACKAGE','min_guest','int',4,10,0,0,0),
  ('PACKAGE','max_guest','int',4,10,0,0,0),
  ('MENU_ITEM','menu_item_id','int',4,10,0,0,1),
  ('MENU_ITEM','package_id','int',4,10,0,0,0),
  ('MENU_ITEM','item_name','nvarchar',300,0,0,0,0),
  ('MENU_ITEM','category','nvarchar',200,0,0,0,0),
  ('MENU_ITEM','description','nvarchar',2000,0,0,1,0),
  ('RESERVATION','reservation_id','int',4,10,0,0,1),
  ('RESERVATION','customer_id','int',4,10,0,0,0),
  ('RESERVATION','event_id','int',4,10,0,0,0),
  ('RESERVATION','event_date','date',3,10,0,0,0),
  ('RESERVATION','event_time','time',3,8,0,0,0),
  ('RESERVATION','guest_count','int',4,10,0,0,0),
  ('RESERVATION','venue_address','nvarchar',1000,0,0,0,0),
  ('RESERVATION','special_request','nvarchar',4000,0,0,1,0),
  ('RESERVATION','status','nvarchar',60,0,0,0,0),
  ('RESERVATION','created_at','datetime2',6,19,0,0,0),
  ('PAYMENT','payment_id','int',4,10,0,0,1),
  ('PAYMENT','reservation_id','int',4,10,0,0,0),
  ('PAYMENT','admin_id','int',4,10,0,1,0),
  ('PAYMENT','amount_due','decimal',9,12,2,0,0),
  ('PAYMENT','amount_paid','decimal',9,12,2,0,0),
  ('PAYMENT','payment_method','nvarchar',100,0,0,1,0),
  ('PAYMENT','payment_date','datetime2',6,19,0,1,0),
  ('PAYMENT','transaction_ref','nvarchar',300,0,0,1,0),
  ('PAYMENT','status','nvarchar',60,0,0,0,0),
  ('NOTIFICATION','notification_id','int',4,10,0,0,1),
  ('NOTIFICATION','reservation_id','int',4,10,0,0,0),
  ('NOTIFICATION','recipient_type','nvarchar',60,0,0,0,0),
  ('NOTIFICATION','recipient_id','int',4,10,0,0,0),
  ('NOTIFICATION','message','nvarchar',-1,0,0,0,0),
  ('NOTIFICATION','status','nvarchar',60,0,0,0,0),
  ('NOTIFICATION','sent_at','datetime2',6,19,0,1,0);

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.column_name, ': missing or incompatible column')
FROM @expected_columns expected
LEFT JOIN sys.tables table_metadata
  ON table_metadata.name=expected.table_name AND table_metadata.schema_id=SCHEMA_ID('dbo')
LEFT JOIN sys.columns column_metadata
  ON column_metadata.object_id=table_metadata.object_id AND column_metadata.name=expected.column_name
LEFT JOIN sys.types type_metadata
  ON type_metadata.user_type_id=column_metadata.user_type_id
LEFT JOIN sys.identity_columns identity_metadata
  ON identity_metadata.object_id=column_metadata.object_id AND identity_metadata.column_id=column_metadata.column_id
WHERE table_metadata.object_id IS NULL
  OR column_metadata.column_id IS NULL
  OR type_metadata.name<>expected.type_name
  OR column_metadata.max_length<>expected.max_length
  OR column_metadata.precision<>expected.precision_value
  OR column_metadata.scale<>expected.scale_value
  OR column_metadata.is_nullable<>expected.is_nullable
  OR CONVERT(bit,CASE WHEN identity_metadata.column_id IS NULL THEN 0 ELSE 1 END)<>expected.is_identity;

DECLARE @expected_indexes TABLE (
  table_name sysname NOT NULL,
  index_name sysname NOT NULL,
  is_unique bit NOT NULL,
  key_columns nvarchar(1000) NOT NULL,
  PRIMARY KEY(table_name,index_name)
);

INSERT @expected_indexes(table_name,index_name,is_unique,key_columns) VALUES
  ('CUSTOMER','PK_CUSTOMER',1,'customer_id'),
  ('CUSTOMER','UQ_CUSTOMER_email',1,'email'),
  ('ADMIN','PK_ADMIN',1,'admin_id'),
  ('ADMIN','UQ_ADMIN_username',1,'username'),
  ('ADMIN','UQ_ADMIN_email',1,'email'),
  ('EVENT','PK_EVENT',1,'event_id'),
  ('EVENT','UQ_EVENT_event_type',1,'event_type'),
  ('PACKAGE','PK_PACKAGE',1,'package_id'),
  ('PACKAGE','UQ_PACKAGE_event_name',1,'event_id,package_name'),
  ('PACKAGE','IX_PACKAGE_event_id',0,'event_id'),
  ('MENU_ITEM','PK_MENU_ITEM',1,'menu_item_id'),
  ('MENU_ITEM','UQ_MENU_ITEM_package_item',1,'package_id,item_name'),
  ('MENU_ITEM','IX_MENU_ITEM_package_id',0,'package_id'),
  ('RESERVATION','PK_RESERVATION',1,'reservation_id'),
  ('RESERVATION','IX_RESERVATION_customer_id',0,'customer_id'),
  ('RESERVATION','IX_RESERVATION_event_id',0,'event_id'),
  ('RESERVATION','IX_RESERVATION_event_date',0,'event_date'),
  ('RESERVATION','IX_RESERVATION_status',0,'status'),
  ('PAYMENT','PK_PAYMENT',1,'payment_id'),
  ('PAYMENT','UQ_PAYMENT_reservation',1,'reservation_id'),
  ('PAYMENT','IX_PAYMENT_admin_id',0,'admin_id'),
  ('PAYMENT','IX_PAYMENT_status',0,'status'),
  ('NOTIFICATION','PK_NOTIFICATION',1,'notification_id'),
  ('NOTIFICATION','IX_NOTIFICATION_reservation_id',0,'reservation_id');

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.index_name, ': missing or incompatible index')
FROM @expected_indexes expected
WHERE NOT EXISTS (
  SELECT 1
  FROM sys.tables table_metadata
  JOIN sys.indexes index_metadata ON index_metadata.object_id=table_metadata.object_id
  CROSS APPLY (
    SELECT STRING_AGG(column_metadata.name, ',') WITHIN GROUP(ORDER BY index_column.key_ordinal) key_columns
    FROM sys.index_columns index_column
    JOIN sys.columns column_metadata
      ON column_metadata.object_id=index_column.object_id AND column_metadata.column_id=index_column.column_id
    WHERE index_column.object_id=index_metadata.object_id
      AND index_column.index_id=index_metadata.index_id
      AND index_column.is_included_column=0
  ) index_keys
  WHERE table_metadata.schema_id=SCHEMA_ID('dbo')
    AND table_metadata.name=expected.table_name
    AND index_metadata.name=expected.index_name
    AND index_metadata.is_unique=expected.is_unique
    AND index_keys.key_columns=expected.key_columns
);

DECLARE @expected_keys TABLE (
  table_name sysname NOT NULL,
  constraint_name sysname NOT NULL,
  constraint_type char(2) NOT NULL,
  PRIMARY KEY(table_name,constraint_name)
);

INSERT @expected_keys(table_name,constraint_name,constraint_type) VALUES
  ('CUSTOMER','PK_CUSTOMER','PK'),
  ('CUSTOMER','UQ_CUSTOMER_email','UQ'),
  ('ADMIN','PK_ADMIN','PK'),
  ('ADMIN','UQ_ADMIN_username','UQ'),
  ('ADMIN','UQ_ADMIN_email','UQ'),
  ('EVENT','PK_EVENT','PK'),
  ('EVENT','UQ_EVENT_event_type','UQ'),
  ('PACKAGE','PK_PACKAGE','PK'),
  ('PACKAGE','UQ_PACKAGE_event_name','UQ'),
  ('MENU_ITEM','PK_MENU_ITEM','PK'),
  ('MENU_ITEM','UQ_MENU_ITEM_package_item','UQ'),
  ('RESERVATION','PK_RESERVATION','PK'),
  ('PAYMENT','PK_PAYMENT','PK'),
  ('PAYMENT','UQ_PAYMENT_reservation','UQ'),
  ('NOTIFICATION','PK_NOTIFICATION','PK');

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.constraint_name, ': missing key constraint')
FROM @expected_keys expected
WHERE NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints key_constraint
  JOIN sys.tables table_metadata ON table_metadata.object_id=key_constraint.parent_object_id
  WHERE table_metadata.schema_id=SCHEMA_ID('dbo')
    AND table_metadata.name=expected.table_name
    AND key_constraint.name=expected.constraint_name
    AND key_constraint.type=expected.constraint_type
);

DECLARE @expected_foreign_keys TABLE (
  table_name sysname NOT NULL,
  constraint_name sysname NOT NULL,
  column_name sysname NOT NULL,
  referenced_table sysname NOT NULL,
  referenced_column sysname NOT NULL,
  PRIMARY KEY(table_name,constraint_name)
);

INSERT @expected_foreign_keys(table_name,constraint_name,column_name,referenced_table,referenced_column) VALUES
  ('PACKAGE','FK_PACKAGE_EVENT','event_id','EVENT','event_id'),
  ('MENU_ITEM','FK_MENU_ITEM_PACKAGE','package_id','PACKAGE','package_id'),
  ('RESERVATION','FK_RESERVATION_CUSTOMER','customer_id','CUSTOMER','customer_id'),
  ('RESERVATION','FK_RESERVATION_EVENT','event_id','EVENT','event_id'),
  ('PAYMENT','FK_PAYMENT_RESERVATION','reservation_id','RESERVATION','reservation_id'),
  ('PAYMENT','FK_PAYMENT_ADMIN','admin_id','ADMIN','admin_id'),
  ('NOTIFICATION','FK_NOTIFICATION_RESERVATION','reservation_id','RESERVATION','reservation_id');

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.constraint_name, ': missing or incompatible foreign key')
FROM @expected_foreign_keys expected
WHERE NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys foreign_key
  JOIN sys.tables parent_table ON parent_table.object_id=foreign_key.parent_object_id
  JOIN sys.tables referenced_table ON referenced_table.object_id=foreign_key.referenced_object_id
  JOIN sys.foreign_key_columns foreign_key_column ON foreign_key_column.constraint_object_id=foreign_key.object_id
  JOIN sys.columns parent_column
    ON parent_column.object_id=foreign_key.parent_object_id AND parent_column.column_id=foreign_key_column.parent_column_id
  JOIN sys.columns referenced_column
    ON referenced_column.object_id=foreign_key.referenced_object_id AND referenced_column.column_id=foreign_key_column.referenced_column_id
  WHERE parent_table.schema_id=SCHEMA_ID('dbo')
    AND parent_table.name=expected.table_name
    AND foreign_key.name=expected.constraint_name
    AND parent_column.name=expected.column_name
    AND referenced_table.name=expected.referenced_table
    AND referenced_column.name=expected.referenced_column
);

DECLARE @expected_checks TABLE(table_name sysname NOT NULL, constraint_name sysname NOT NULL PRIMARY KEY(table_name,constraint_name));
INSERT @expected_checks(table_name,constraint_name) VALUES
  ('ADMIN','CK_ADMIN_status'),
  ('PACKAGE','CK_PACKAGE_price_per_head'),
  ('PACKAGE','CK_PACKAGE_min_guest'),
  ('PACKAGE','CK_PACKAGE_max_guest'),
  ('RESERVATION','CK_RESERVATION_guest_count'),
  ('RESERVATION','CK_RESERVATION_status'),
  ('PAYMENT','CK_PAYMENT_amount_due'),
  ('PAYMENT','CK_PAYMENT_amount_paid'),
  ('PAYMENT','CK_PAYMENT_method'),
  ('PAYMENT','CK_PAYMENT_status'),
  ('NOTIFICATION','CK_NOTIFICATION_recipient_type'),
  ('NOTIFICATION','CK_NOTIFICATION_status');

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.constraint_name, ': missing or untrusted check constraint')
FROM @expected_checks expected
WHERE NOT EXISTS (
  SELECT 1 FROM sys.check_constraints check_constraint
  JOIN sys.tables table_metadata ON table_metadata.object_id=check_constraint.parent_object_id
  WHERE table_metadata.schema_id=SCHEMA_ID('dbo')
    AND table_metadata.name=expected.table_name
    AND check_constraint.name=expected.constraint_name
    AND check_constraint.is_disabled=0
    AND check_constraint.is_not_trusted=0
);

DECLARE @expected_defaults TABLE(table_name sysname NOT NULL, column_name sysname NOT NULL, constraint_name sysname NOT NULL, PRIMARY KEY(table_name,column_name));
INSERT @expected_defaults(table_name,column_name,constraint_name) VALUES
  ('CUSTOMER','created_at','DF_CUSTOMER_created_at'),
  ('ADMIN','status','DF_ADMIN_status'),
  ('RESERVATION','status','DF_RESERVATION_status'),
  ('RESERVATION','created_at','DF_RESERVATION_created_at'),
  ('PAYMENT','amount_paid','DF_PAYMENT_amount_paid'),
  ('PAYMENT','status','DF_PAYMENT_status'),
  ('NOTIFICATION','status','DF_NOTIFICATION_status');

INSERT @violations(violation)
SELECT CONCAT('dbo.', expected.table_name, '.', expected.column_name, ': missing default ', expected.constraint_name)
FROM @expected_defaults expected
WHERE NOT EXISTS (
  SELECT 1 FROM sys.default_constraints default_constraint
  JOIN sys.tables table_metadata ON table_metadata.object_id=default_constraint.parent_object_id
  JOIN sys.columns column_metadata
    ON column_metadata.object_id=default_constraint.parent_object_id AND column_metadata.column_id=default_constraint.parent_column_id
  WHERE table_metadata.schema_id=SCHEMA_ID('dbo')
    AND table_metadata.name=expected.table_name
    AND column_metadata.name=expected.column_name
    AND default_constraint.name=expected.constraint_name
);

IF EXISTS(SELECT 1 FROM @violations)
BEGIN
  DECLARE @message nvarchar(2048);
  SELECT @message=STRING_AGG(violation, '; ') FROM @violations;
  THROW 51000, @message, 1;
END;

COMMIT;
