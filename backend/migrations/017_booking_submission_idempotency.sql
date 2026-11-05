SET XACT_ABORT ON;

IF OBJECT_ID('dbo.BOOKING_SUBMISSION','U') IS NULL
BEGIN
  CREATE TABLE dbo.BOOKING_SUBMISSION(
    customer_id int NOT NULL,
    submission_key uniqueidentifier NOT NULL,
    request_hash char(64) NOT NULL,
    reservation_id int NOT NULL,
    response_json nvarchar(max) NOT NULL,
    CONSTRAINT PK_BOOKING_SUBMISSION PRIMARY KEY(customer_id,submission_key),
    CONSTRAINT FK_BOOKING_SUBMISSION_CUSTOMER FOREIGN KEY(customer_id) REFERENCES dbo.CUSTOMER(customer_id),
    CONSTRAINT FK_BOOKING_SUBMISSION_RESERVATION FOREIGN KEY(reservation_id) REFERENCES dbo.RESERVATION(reservation_id),
    CONSTRAINT CK_BOOKING_SUBMISSION_response_json CHECK(ISJSON(response_json)=1)
  );
END;
