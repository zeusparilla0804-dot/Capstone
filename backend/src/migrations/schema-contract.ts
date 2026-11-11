import type sql from 'mssql';

export type MigrationHistoryMode = 'fresh' | 'compatible';

export interface SchemaContractOptions {
  migrationHistory: MigrationHistoryMode;
}

export interface ColumnShape {
  table: string;
  name: string;
  type: string;
  maxLength: number;
  precision: number;
  scale: number;
  nullable: boolean;
  identity: boolean;
}

export interface ConstraintShape {
  table: string;
  name: string;
  type: 'C' | 'D' | 'F' | 'PK' | 'UQ';
}

export interface IndexShape {
  table: string;
  name: string;
  unique: boolean;
  keys: string[];
  includes: string[];
  filter: string | null;
}

export interface SequenceShape {
  name: string;
  type: string;
  increment: number;
}

export interface SchemaSnapshot {
  migrations: string[];
  tables: string[];
  columns: ColumnShape[];
  constraints: ConstraintShape[];
  indexes: IndexShape[];
  sequences: SequenceShape[];
}

export const EXPECTED_MIGRATIONS = [
  '000_initial_schema.sql',
  '001_phase5_data_layer.sql',
  '002_phase6_admin.sql',
  '003_phase7_invoices.sql',
  '004_phase8_production_hardening.sql',
  '005_phase81_admin_audit.sql',
  '006_phase81_system_event_types.sql',
  '008_admin_operations_core.sql',
  '009_release_rejected_proof_references.sql',
  '010_booking_capacity_availability.sql',
  '011_password_recovery.sql',
  '012_package_pricing_models.sql',
  '013_custom_event_quotation.sql',
  '014_custom_quote_invoice_quantity.sql',
  '015_customer_account_status.sql',
  '016_reservation_add_on_quantity.sql',
  '017_booking_submission_idempotency.sql',
  '018_authentication_security.sql',
  '019_customer_email_verification.sql',
  '020_booking_timing_policy.sql',
  '021_admin_mfa.sql',
  '022_payment_destinations.sql',
  '022_payment_destinations_seed',
  '023_customer_updates_package_images.sql',
];

const HISTORICAL_COMPATIBLE_MIGRATIONS = new Set(['007_starter_catalog.sql']);

function column(
  table: string,
  name: string,
  type: string,
  maxLength: number,
  precision: number,
  scale: number,
  nullable: boolean,
  identity = false,
): ColumnShape {
  return { table, name, type, maxLength, precision, scale, nullable, identity };
}

function nvarchar(table: string, name: string, length: number, nullable = false): ColumnShape {
  return column(table, name, 'nvarchar', length === -1 ? -1 : length * 2, 0, 0, nullable);
}

function integer(table: string, name: string, nullable = false, identity = false): ColumnShape {
  return column(table, name, 'int', 4, 10, 0, nullable, identity);
}

function bigint(table: string, name: string, nullable = false, identity = false): ColumnShape {
  return column(table, name, 'bigint', 8, 19, 0, nullable, identity);
}

function decimal(table: string, name: string, nullable = false): ColumnShape {
  return column(table, name, 'decimal', 9, 12, 2, nullable);
}

function datetime2(table: string, name: string, nullable = false, scale = 7): ColumnShape {
  return column(table, name, 'datetime2', scale <= 2 ? 6 : scale <= 4 ? 7 : 8, scale === 0 ? 19 : 20 + scale, scale, nullable);
}

const columns: ColumnShape[] = [
  integer('PAYMENT_DESTINATION', 'destination_id', false, true),
  nvarchar('PAYMENT_DESTINATION', 'method', 30), nvarchar('PAYMENT_DESTINATION', 'label', 100),
  nvarchar('PAYMENT_DESTINATION', 'account_name', 200), nvarchar('PAYMENT_DESTINATION', 'account_hint', 50),
  nvarchar('PAYMENT_DESTINATION', 'image_mime', 30),
  column('PAYMENT_DESTINATION', 'image_bytes', 'varbinary', -1, 0, 0, false),
  column('PAYMENT_DESTINATION', 'is_available', 'bit', 1, 1, 0, false),
  datetime2('PAYMENT_DESTINATION', 'created_at', false, 0), datetime2('PAYMENT_DESTINATION', 'updated_at', false, 0),
  integer('BOOKING_PAYMENT_DESTINATION', 'reservation_id'), integer('BOOKING_PAYMENT_DESTINATION', 'destination_id'),
  integer('BOOKING_PAYMENT_DESTINATION', 'assigned_by'), datetime2('BOOKING_PAYMENT_DESTINATION', 'assigned_at', false, 0),
  integer('CUSTOMER_NOTIFICATION_READ', 'customer_id'), nvarchar('CUSTOMER_NOTIFICATION_READ', 'notification_key', 120),
  datetime2('CUSTOMER_NOTIFICATION_READ', 'read_at'),
  integer('PACKAGE_IMAGE', 'image_id', false, true), integer('PACKAGE_IMAGE', 'package_id'), integer('PACKAGE_IMAGE', 'sort_order'),
  nvarchar('PACKAGE_IMAGE', 'asset_path', 300, true), nvarchar('PACKAGE_IMAGE', 'image_mime', 30, true),
  column('PACKAGE_IMAGE', 'image_bytes', 'varbinary', -1, 0, 0, true),
  nvarchar('SCHEMA_MIGRATION', 'migration_name', 255), datetime2('SCHEMA_MIGRATION', 'applied_at'),

  integer('CUSTOMER', 'customer_id', false, true), nvarchar('CUSTOMER', 'first_name', 100),
  nvarchar('CUSTOMER', 'last_name', 100), nvarchar('CUSTOMER', 'email', 255),
  nvarchar('CUSTOMER', 'contact_number', 30), nvarchar('CUSTOMER', 'address', 500, true),
  nvarchar('CUSTOMER', 'password', 255), datetime2('CUSTOMER', 'created_at', false, 0),
  nvarchar('CUSTOMER', 'status', 20),
  column('CUSTOMER', 'requires_email_verification', 'bit', 1, 1, 0, false),
  datetime2('CUSTOMER', 'email_verified_at', true), nvarchar('CUSTOMER', 'verified_email', 255, true),
  integer('EMAIL_VERIFICATION_CHALLENGE', 'customer_id'), column('EMAIL_VERIFICATION_CHALLENGE', 'selector', 'char', 22, 0, 0, false),
  nvarchar('EMAIL_VERIFICATION_CHALLENGE', 'email', 255), column('EMAIL_VERIFICATION_CHALLENGE', 'code_hash', 'char', 64, 0, 0, false),
  integer('EMAIL_VERIFICATION_CHALLENGE', 'attempts'), datetime2('EMAIL_VERIFICATION_CHALLENGE', 'created_at'),
  datetime2('EMAIL_VERIFICATION_CHALLENGE', 'expires_at'), datetime2('EMAIL_VERIFICATION_CHALLENGE', 'window_started_at'),
  integer('EMAIL_VERIFICATION_CHALLENGE', 'issuance_count'), datetime2('EMAIL_VERIFICATION_CHALLENGE', 'locked_until', true),

  integer('ADMIN', 'admin_id', false, true), nvarchar('ADMIN', 'username', 100),
  nvarchar('ADMIN', 'password', 255), nvarchar('ADMIN', 'full_name', 200),
  nvarchar('ADMIN', 'role', 50), nvarchar('ADMIN', 'contact_number', 30, true),
  nvarchar('ADMIN', 'email', 255), nvarchar('ADMIN', 'status', 20),

  integer('EVENT', 'event_id', false, true), nvarchar('EVENT', 'event_type', 100),
  nvarchar('EVENT', 'description', 1000, true),

  integer('PACKAGE', 'package_id', false, true), integer('PACKAGE', 'event_id'),
  nvarchar('PACKAGE', 'package_name', 150), nvarchar('PACKAGE', 'description', 1000, true),
  column('PACKAGE', 'pricing_type', 'varchar', 20, 0, 0, false),
  decimal('PACKAGE', 'price_per_head', true), decimal('PACKAGE', 'base_price', true),
  integer('PACKAGE', 'included_guests', true), decimal('PACKAGE', 'excess_guest_price', true),
  integer('PACKAGE', 'min_guest', true), integer('PACKAGE', 'max_guest', true),
  column('PACKAGE', 'is_active', 'bit', 1, 1, 0, false),

  integer('MENU_ITEM', 'menu_item_id', false, true), integer('MENU_ITEM', 'package_id'),
  nvarchar('MENU_ITEM', 'item_name', 150), nvarchar('MENU_ITEM', 'category', 100),
  nvarchar('MENU_ITEM', 'description', 1000, true),

  integer('RESERVATION', 'reservation_id', false, true), integer('RESERVATION', 'customer_id'),
  integer('RESERVATION', 'event_id'), column('RESERVATION', 'event_date', 'date', 3, 10, 0, false),
  column('RESERVATION', 'event_time', 'time', 3, 8, 0, false), integer('RESERVATION', 'guest_count'),
  nvarchar('RESERVATION', 'venue_address', 500), nvarchar('RESERVATION', 'special_request', 2000, true),
  nvarchar('RESERVATION', 'status', 30), datetime2('RESERVATION', 'created_at', false, 0),
  integer('RESERVATION', 'package_id', true), nvarchar('RESERVATION', 'booking_reference', 30, true),
  decimal('RESERVATION', 'package_unit_price', true), decimal('RESERVATION', 'subtotal', true),
  decimal('RESERVATION', 'discount_amount'), decimal('RESERVATION', 'total_amount', true),
  nvarchar('RESERVATION', 'package_name_snapshot', 150, true),
  column('RESERVATION', 'package_pricing_type', 'varchar', 20, 0, 0, true),
  decimal('RESERVATION', 'package_base_price', true), integer('RESERVATION', 'package_included_guests', true),
  decimal('RESERVATION', 'package_excess_guest_price', true), decimal('RESERVATION', 'package_total', true),
  integer('RESERVATION', 'accepted_quote_id', true),

  integer('PAYMENT', 'payment_id', false, true), integer('PAYMENT', 'reservation_id'),
  integer('PAYMENT', 'admin_id', true), decimal('PAYMENT', 'amount_due'), decimal('PAYMENT', 'amount_paid'),
  nvarchar('PAYMENT', 'payment_method', 50, true), datetime2('PAYMENT', 'payment_date', true, 0),
  nvarchar('PAYMENT', 'transaction_ref', 150, true), nvarchar('PAYMENT', 'status', 30),

  integer('NOTIFICATION', 'notification_id', false, true), integer('NOTIFICATION', 'reservation_id'),
  nvarchar('NOTIFICATION', 'recipient_type', 30), integer('NOTIFICATION', 'recipient_id'),
  nvarchar('NOTIFICATION', 'message', -1), nvarchar('NOTIFICATION', 'status', 30),
  datetime2('NOTIFICATION', 'sent_at', true, 0),

  integer('ADD_ON', 'add_on_id', false, true), nvarchar('ADD_ON', 'add_on_name', 150),
  nvarchar('ADD_ON', 'description', 1000, true), decimal('ADD_ON', 'price'),
  column('ADD_ON', 'is_active', 'bit', 1, 1, 0, false),

  integer('RESERVATION_ADD_ON', 'reservation_id'), integer('RESERVATION_ADD_ON', 'add_on_id'),
  decimal('RESERVATION_ADD_ON', 'unit_price'), integer('RESERVATION_ADD_ON', 'quantity'),

  integer('BOOKING_SUBMISSION', 'customer_id'),
  column('BOOKING_SUBMISSION', 'submission_key', 'uniqueidentifier', 16, 0, 0, false),
  column('BOOKING_SUBMISSION', 'request_hash', 'char', 64, 0, 0, false),
  integer('BOOKING_SUBMISSION', 'reservation_id'), nvarchar('BOOKING_SUBMISSION', 'response_json', -1),

  integer('BOOKING_POLICY', 'reservation_id'), integer('BOOKING_POLICY', 'policy_version'),
  nvarchar('BOOKING_POLICY', 'stage', 30), datetime2('BOOKING_POLICY', 'event_start_at'),
  integer('BOOKING_POLICY', 'preparation_hours'), datetime2('BOOKING_POLICY', 'preparation_cutoff_at'),
  datetime2('BOOKING_POLICY', 'review_target_at'), datetime2('BOOKING_POLICY', 'approved_for_payment_at', true),
  datetime2('BOOKING_POLICY', 'payment_due_at', true), datetime2('BOOKING_POLICY', 'verification_due_at', true),
  nvarchar('BOOKING_POLICY', 'hold_status', 20), column('BOOKING_POLICY', 'review_required', 'bit', 1, 1, 0, false),
  nvarchar('BOOKING_POLICY', 'review_reason', 100, true), integer('BOOKING_POLICY', 'exception_approved_by', true),
  nvarchar('BOOKING_POLICY', 'exception_reason', 1000, true), datetime2('BOOKING_POLICY', 'exception_deadline', true),
  column('BOOKING_POLICY', 'preparation_exception_acknowledged', 'bit', 1, 1, 0, false), datetime2('BOOKING_POLICY', 'updated_at'),

  bigint('AUTH_SESSION', 'session_id', false, true), integer('AUTH_SESSION', 'customer_id'),
  column('AUTH_SESSION', 'token_hash', 'char', 64, 0, 0, false), datetime2('AUTH_SESSION', 'expires_at'),
  datetime2('AUTH_SESSION', 'created_at'),

  bigint('ADMIN_SESSION', 'session_id', false, true), integer('ADMIN_SESSION', 'admin_id'),
  column('ADMIN_SESSION', 'token_hash', 'char', 64, 0, 0, false), datetime2('ADMIN_SESSION', 'expires_at'),
  datetime2('ADMIN_SESSION', 'created_at'),
  datetime2('ADMIN_SESSION', 'last_seen_at'),
  integer('ADMIN_MFA', 'admin_id'), column('ADMIN_MFA', 'secret_ciphertext', 'varbinary', 128, 0, 0, false),
  column('ADMIN_MFA', 'enabled', 'bit', 1, 1, 0, false), bigint('ADMIN_MFA', 'last_step', true),
  nvarchar('ADMIN_MFA', 'recovery_code_hashes', -1), column('ADMIN_MFA', 'challenge_hash', 'char', 64, 0, 0, true),
  nvarchar('ADMIN_MFA', 'challenge_password_hash', 255, true), datetime2('ADMIN_MFA', 'challenge_expires_at', true),
  column('AUTH_LOGIN_ATTEMPT', 'subject_hash', 'char', 64, 0, 0, false),
  integer('AUTH_LOGIN_ATTEMPT', 'attempts'), datetime2('AUTH_LOGIN_ATTEMPT', 'window_started_at'),
  datetime2('AUTH_LOGIN_ATTEMPT', 'blocked_until', true),
  bigint('AUTH_SECURITY_EVENT', 'event_id', false, true),
  column('AUTH_SECURITY_EVENT', 'principal_type', 'varchar', 8, 0, 0, false),
  integer('AUTH_SECURITY_EVENT', 'principal_id', true),
  column('AUTH_SECURITY_EVENT', 'subject_hash', 'char', 64, 0, 0, false),
  column('AUTH_SECURITY_EVENT', 'ip_hash', 'char', 64, 0, 0, true),
  column('AUTH_SECURITY_EVENT', 'event_type', 'varchar', 24, 0, 0, false),
  datetime2('AUTH_SECURITY_EVENT', 'created_at'),

  bigint('PAYMENT_TRANSACTION', 'payment_transaction_id', false, true), integer('PAYMENT_TRANSACTION', 'payment_id'),
  integer('PAYMENT_TRANSACTION', 'admin_id'), decimal('PAYMENT_TRANSACTION', 'amount'),
  nvarchar('PAYMENT_TRANSACTION', 'payment_method', 50), nvarchar('PAYMENT_TRANSACTION', 'transaction_ref', 150, true),
  datetime2('PAYMENT_TRANSACTION', 'payment_date'), datetime2('PAYMENT_TRANSACTION', 'created_at'),

  integer('INVOICE', 'invoice_id', false, true), integer('INVOICE', 'reservation_id'),
  nvarchar('INVOICE', 'invoice_number', 30), datetime2('INVOICE', 'issued_at'),
  datetime2('INVOICE', 'due_at', true), nvarchar('INVOICE', 'status', 30),
  decimal('INVOICE', 'subtotal'), decimal('INVOICE', 'discount_amount'), decimal('INVOICE', 'total_amount'),
  integer('INVOICE', 'issued_by'), datetime2('INVOICE', 'created_at'),

  bigint('INVOICE_ITEM', 'invoice_item_id', false, true), integer('INVOICE_ITEM', 'invoice_id'),
  nvarchar('INVOICE_ITEM', 'description', 250), decimal('INVOICE_ITEM', 'quantity'),
  decimal('INVOICE_ITEM', 'unit_price'), decimal('INVOICE_ITEM', 'line_total'),
  nvarchar('INVOICE_ITEM', 'item_type', 30),

  bigint('ADMIN_AUDIT_LOG', 'audit_id', false, true), integer('ADMIN_AUDIT_LOG', 'admin_id'),
  nvarchar('ADMIN_AUDIT_LOG', 'action', 80), nvarchar('ADMIN_AUDIT_LOG', 'entity_type', 50),
  integer('ADMIN_AUDIT_LOG', 'entity_id'), nvarchar('ADMIN_AUDIT_LOG', 'old_values', -1, true),
  nvarchar('ADMIN_AUDIT_LOG', 'new_values', -1, true), datetime2('ADMIN_AUDIT_LOG', 'created_at'),

  bigint('PAYMENT_PROOF', 'payment_proof_id', false, true), integer('PAYMENT_PROOF', 'reservation_id'),
  integer('PAYMENT_PROOF', 'customer_id'), integer('PAYMENT_PROOF', 'payment_id', true),
  bigint('PAYMENT_PROOF', 'payment_transaction_id', true), integer('PAYMENT_PROOF', 'invoice_id', true),
  nvarchar('PAYMENT_PROOF', 'method', 30), decimal('PAYMENT_PROOF', 'claimed_amount'),
  nvarchar('PAYMENT_PROOF', 'transaction_reference', 150, true), datetime2('PAYMENT_PROOF', 'payment_date'),
  nvarchar('PAYMENT_PROOF', 'storage_key', 500), nvarchar('PAYMENT_PROOF', 'original_filename', 255),
  nvarchar('PAYMENT_PROOF', 'mime_type', 100), bigint('PAYMENT_PROOF', 'byte_size'),
  nvarchar('PAYMENT_PROOF', 'status', 30), nvarchar('PAYMENT_PROOF', 'rejection_reason', 1000, true),
  integer('PAYMENT_PROOF', 'reviewed_by', true), datetime2('PAYMENT_PROOF', 'reviewed_at', true),
  decimal('PAYMENT_PROOF', 'verified_amount', true), datetime2('PAYMENT_PROOF', 'created_at'),
  datetime2('PAYMENT_PROOF', 'updated_at'), nvarchar('PAYMENT_PROOF', 'archived_transaction_reference', 150, true),

  bigint('BOOKING_STATUS_HISTORY', 'booking_status_history_id', false, true),
  integer('BOOKING_STATUS_HISTORY', 'reservation_id'), nvarchar('BOOKING_STATUS_HISTORY', 'previous_status', 40, true),
  nvarchar('BOOKING_STATUS_HISTORY', 'next_status', 40), nvarchar('BOOKING_STATUS_HISTORY', 'actor_type', 20),
  integer('BOOKING_STATUS_HISTORY', 'actor_id', true), nvarchar('BOOKING_STATUS_HISTORY', 'reason', 1000, true),
  datetime2('BOOKING_STATUS_HISTORY', 'created_at'),

  bigint('EMAIL_OUTBOX', 'notification_id', false, true), nvarchar('EMAIL_OUTBOX', 'recipient', 320),
  nvarchar('EMAIL_OUTBOX', 'normalized_recipient', 320), nvarchar('EMAIL_OUTBOX', 'template_key', 80),
  nvarchar('EMAIL_OUTBOX', 'payload', -1), nvarchar('EMAIL_OUTBOX', 'related_entity_type', 50, true),
  bigint('EMAIL_OUTBOX', 'related_entity_id', true), nvarchar('EMAIL_OUTBOX', 'status', 20),
  integer('EMAIL_OUTBOX', 'attempt_count'), datetime2('EMAIL_OUTBOX', 'next_attempt_at', true),
  nvarchar('EMAIL_OUTBOX', 'last_error', 2000, true), datetime2('EMAIL_OUTBOX', 'created_at'),
  datetime2('EMAIL_OUTBOX', 'sent_at', true), datetime2('EMAIL_OUTBOX', 'updated_at'),

  bigint('PASSWORD_RESET_TOKEN', 'reset_id', false, true),
  column('PASSWORD_RESET_TOKEN', 'selector', 'char', 22, 0, 0, false),
  column('PASSWORD_RESET_TOKEN', 'token_hash', 'char', 64, 0, 0, false),
  column('PASSWORD_RESET_TOKEN', 'principal_type', 'varchar', 10, 0, 0, false),
  integer('PASSWORD_RESET_TOKEN', 'customer_id', true), integer('PASSWORD_RESET_TOKEN', 'admin_id', true),
  datetime2('PASSWORD_RESET_TOKEN', 'expires_at'), datetime2('PASSWORD_RESET_TOKEN', 'used_at', true),
  datetime2('PASSWORD_RESET_TOKEN', 'invalidated_at', true), datetime2('PASSWORD_RESET_TOKEN', 'created_at'),

  integer('CUSTOM_EVENT_REQUEST', 'request_id', false, true), integer('CUSTOM_EVENT_REQUEST', 'reservation_id'),
  integer('CUSTOM_EVENT_REQUEST', 'source_package_id', true), decimal('CUSTOM_EVENT_REQUEST', 'target_budget', true),
  nvarchar('CUSTOM_EVENT_REQUEST', 'menu_preferences', 2000, true), nvarchar('CUSTOM_EVENT_REQUEST', 'dietary_notes', 2000, true),
  nvarchar('CUSTOM_EVENT_REQUEST', 'setup_preferences', 2000, true), nvarchar('CUSTOM_EVENT_REQUEST', 'requested_services', 2000, true),
  nvarchar('CUSTOM_EVENT_REQUEST', 'special_requests', 2000, true), column('CUSTOM_EVENT_REQUEST', 'status', 'varchar', 30, 0, 0, false),
  nvarchar('CUSTOM_EVENT_REQUEST', 'clarification_reason', 1000, true), nvarchar('CUSTOM_EVENT_REQUEST', 'rejection_reason', 1000, true),
  datetime2('CUSTOM_EVENT_REQUEST', 'created_at'), datetime2('CUSTOM_EVENT_REQUEST', 'updated_at'),

  integer('CUSTOM_QUOTE', 'quote_id', false, true), integer('CUSTOM_QUOTE', 'request_id'),
  integer('CUSTOM_QUOTE', 'version'), decimal('CUSTOM_QUOTE', 'subtotal'), decimal('CUSTOM_QUOTE', 'discount_amount'),
  decimal('CUSTOM_QUOTE', 'total_amount'), decimal('CUSTOM_QUOTE', 'required_down_payment'),
  column('CUSTOM_QUOTE', 'valid_until', 'date', 3, 10, 0, false), nvarchar('CUSTOM_QUOTE', 'terms', 4000, true),
  column('CUSTOM_QUOTE', 'status', 'varchar', 20, 0, 0, false), integer('CUSTOM_QUOTE', 'sent_by', true),
  datetime2('CUSTOM_QUOTE', 'sent_at', true), datetime2('CUSTOM_QUOTE', 'accepted_at', true),
  datetime2('CUSTOM_QUOTE', 'declined_at', true), datetime2('CUSTOM_QUOTE', 'created_at'),

  bigint('CUSTOM_QUOTE_ITEM', 'quote_item_id', false, true), integer('CUSTOM_QUOTE_ITEM', 'quote_id'),
  integer('CUSTOM_QUOTE_ITEM', 'sort_order'), decimal('CUSTOM_QUOTE_ITEM', 'quantity'),
  decimal('CUSTOM_QUOTE_ITEM', 'unit_price'), decimal('CUSTOM_QUOTE_ITEM', 'line_total'),
  nvarchar('CUSTOM_QUOTE_ITEM', 'description', 250),
];

function constraints(table: string, type: ConstraintShape['type'], names: string[]): ConstraintShape[] {
  return names.map((name) => ({ table, name, type }));
}

const constraintShapes: ConstraintShape[] = [
  ...constraints('SCHEMA_MIGRATION', 'PK', ['PK_SCHEMA_MIGRATION']),
  ...constraints('SCHEMA_MIGRATION', 'D', ['DF_SCHEMA_MIGRATION_applied']),
  ...constraints('CUSTOMER', 'PK', ['PK_CUSTOMER']), ...constraints('CUSTOMER', 'UQ', ['UQ_CUSTOMER_email']),
  ...constraints('CUSTOMER', 'D', ['DF_CUSTOMER_created_at', 'DF_CUSTOMER_status']),
  ...constraints('CUSTOMER', 'C', ['CK_CUSTOMER_status']),
  ...constraints('ADMIN', 'PK', ['PK_ADMIN']), ...constraints('ADMIN', 'UQ', ['UQ_ADMIN_username', 'UQ_ADMIN_email']),
  ...constraints('ADMIN', 'D', ['DF_ADMIN_status']), ...constraints('ADMIN', 'C', ['CK_ADMIN_status']),
  ...constraints('EVENT', 'PK', ['PK_EVENT']), ...constraints('EVENT', 'UQ', ['UQ_EVENT_event_type']),
  ...constraints('PACKAGE', 'PK', ['PK_PACKAGE']), ...constraints('PACKAGE', 'UQ', ['UQ_PACKAGE_event_name']),
  ...constraints('PACKAGE', 'F', ['FK_PACKAGE_EVENT']), ...constraints('PACKAGE', 'D', ['DF_PACKAGE_is_active', 'DF_PACKAGE_pricing_type']),
  ...constraints('PACKAGE', 'C', ['CK_PACKAGE_pricing_model', 'CK_PACKAGE_guest_limits']),
  ...constraints('MENU_ITEM', 'PK', ['PK_MENU_ITEM']), ...constraints('MENU_ITEM', 'UQ', ['UQ_MENU_ITEM_package_item']),
  ...constraints('MENU_ITEM', 'F', ['FK_MENU_ITEM_PACKAGE']),
  ...constraints('RESERVATION', 'PK', ['PK_RESERVATION']),
  ...constraints('RESERVATION', 'F', ['FK_RESERVATION_CUSTOMER', 'FK_RESERVATION_EVENT', 'FK_RESERVATION_PACKAGE', 'FK_RESERVATION_ACCEPTED_QUOTE']),
  ...constraints('RESERVATION', 'D', ['DF_RESERVATION_status', 'DF_RESERVATION_created_at', 'DF_RESERVATION_discount']),
  ...constraints('RESERVATION', 'C', ['CK_RESERVATION_guest_count', 'CK_RESERVATION_status', 'CK_RESERVATION_financials', 'CK_RESERVATION_package_pricing_snapshot']),
  ...constraints('PAYMENT', 'PK', ['PK_PAYMENT']), ...constraints('PAYMENT', 'UQ', ['UQ_PAYMENT_reservation']),
  ...constraints('PAYMENT', 'F', ['FK_PAYMENT_RESERVATION', 'FK_PAYMENT_ADMIN']),
  ...constraints('PAYMENT', 'D', ['DF_PAYMENT_amount_paid', 'DF_PAYMENT_status']),
  ...constraints('PAYMENT', 'C', ['CK_PAYMENT_amount_due', 'CK_PAYMENT_amount_paid', 'CK_PAYMENT_method', 'CK_PAYMENT_status', 'CK_PAYMENT_amounts']),
  ...constraints('NOTIFICATION', 'PK', ['PK_NOTIFICATION']), ...constraints('NOTIFICATION', 'F', ['FK_NOTIFICATION_RESERVATION']),
  ...constraints('NOTIFICATION', 'D', ['DF_NOTIFICATION_status']),
  ...constraints('NOTIFICATION', 'C', ['CK_NOTIFICATION_recipient_type', 'CK_NOTIFICATION_status']),
  ...constraints('ADD_ON', 'PK', ['PK_ADD_ON']), ...constraints('ADD_ON', 'UQ', ['UQ_ADD_ON_name']),
  ...constraints('ADD_ON', 'D', ['DF_ADD_ON_is_active']), ...constraints('ADD_ON', 'C', ['CK_ADD_ON_price']),
  ...constraints('RESERVATION_ADD_ON', 'PK', ['PK_RESERVATION_ADD_ON']),
  ...constraints('RESERVATION_ADD_ON', 'F', ['FK_RESERVATION_ADD_ON_RESERVATION', 'FK_RESERVATION_ADD_ON_ADD_ON']),
  ...constraints('RESERVATION_ADD_ON', 'C', ['CK_RESERVATION_ADD_ON_price', 'CK_RESERVATION_ADD_ON_quantity']),
  ...constraints('RESERVATION_ADD_ON', 'D', ['DF_RESERVATION_ADD_ON_quantity']),
  ...constraints('BOOKING_SUBMISSION', 'PK', ['PK_BOOKING_SUBMISSION']),
  ...constraints('BOOKING_SUBMISSION', 'F', ['FK_BOOKING_SUBMISSION_CUSTOMER', 'FK_BOOKING_SUBMISSION_RESERVATION']),
  ...constraints('BOOKING_SUBMISSION', 'C', ['CK_BOOKING_SUBMISSION_response_json']),
  ...constraints('BOOKING_POLICY', 'PK', ['PK_BOOKING_POLICY']),
  ...constraints('BOOKING_POLICY', 'F', ['FK_BOOKING_POLICY_RESERVATION', 'FK_BOOKING_POLICY_APPROVER']),
  ...constraints('BOOKING_POLICY', 'D', ['DF_BOOKING_POLICY_version', 'DF_BOOKING_POLICY_preparation_exception', 'DF_BOOKING_POLICY_updated']),
  ...constraints('BOOKING_POLICY', 'C', ['CK_BOOKING_POLICY_version', 'CK_BOOKING_POLICY_stage', 'CK_BOOKING_POLICY_hold', 'CK_BOOKING_POLICY_preparation']),
  ...constraints('AUTH_SESSION', 'PK', ['PK_AUTH_SESSION']), ...constraints('AUTH_SESSION', 'UQ', ['UQ_AUTH_SESSION_token_hash']),
  ...constraints('AUTH_SESSION', 'F', ['FK_AUTH_SESSION_CUSTOMER']), ...constraints('AUTH_SESSION', 'D', ['DF_AUTH_SESSION_created']),
  ...constraints('ADMIN_SESSION', 'PK', ['PK_ADMIN_SESSION']), ...constraints('ADMIN_SESSION', 'UQ', ['UQ_ADMIN_SESSION_token']),
  ...constraints('ADMIN_SESSION', 'F', ['FK_ADMIN_SESSION_ADMIN']), ...constraints('ADMIN_SESSION', 'D', ['DF_ADMIN_SESSION_created']),
  ...constraints('ADMIN_SESSION', 'D', ['DF_ADMIN_SESSION_last_seen']),
  ...constraints('ADMIN_MFA', 'PK', ['PK_ADMIN_MFA']), ...constraints('ADMIN_MFA', 'F', ['FK_ADMIN_MFA_ADMIN']),
  ...constraints('ADMIN_MFA', 'D', ['DF_ADMIN_MFA_enabled']), ...constraints('ADMIN_MFA', 'C', ['CK_ADMIN_MFA_recovery_json']),
  ...constraints('AUTH_LOGIN_ATTEMPT', 'PK', ['PK_AUTH_LOGIN_ATTEMPT']),
  ...constraints('CUSTOMER', 'D', ['DF_CUSTOMER_requires_email_verification']),
  ...constraints('EMAIL_VERIFICATION_CHALLENGE', 'PK', ['PK_EMAIL_VERIFICATION_CHALLENGE']),
  ...constraints('EMAIL_VERIFICATION_CHALLENGE', 'UQ', ['UQ_EMAIL_VERIFICATION_CHALLENGE_selector']),
  ...constraints('EMAIL_VERIFICATION_CHALLENGE', 'F', ['FK_EMAIL_VERIFICATION_CHALLENGE_CUSTOMER']),
  ...constraints('EMAIL_VERIFICATION_CHALLENGE', 'C', ['CK_EMAIL_VERIFICATION_CHALLENGE_attempts', 'CK_EMAIL_VERIFICATION_CHALLENGE_issuances']),
  ...constraints('AUTH_LOGIN_ATTEMPT', 'C', ['CK_AUTH_LOGIN_ATTEMPT_count']),
  ...constraints('AUTH_SECURITY_EVENT', 'PK', ['PK_AUTH_SECURITY_EVENT']),
  ...constraints('AUTH_SECURITY_EVENT', 'C', ['CK_AUTH_SECURITY_EVENT_role', 'CK_AUTH_SECURITY_EVENT_type']),
  ...constraints('AUTH_SECURITY_EVENT', 'D', ['DF_AUTH_SECURITY_EVENT_created']),
  ...constraints('PAYMENT_TRANSACTION', 'PK', ['PK_PAYMENT_TRANSACTION']),
  ...constraints('PAYMENT_TRANSACTION', 'F', ['FK_PAYMENT_TRANSACTION_PAYMENT', 'FK_PAYMENT_TRANSACTION_ADMIN']),
  ...constraints('PAYMENT_TRANSACTION', 'D', ['DF_PAYMENT_TRANSACTION_created']),
  ...constraints('PAYMENT_TRANSACTION', 'C', ['CK_PAYMENT_TRANSACTION_amount']),
  ...constraints('INVOICE', 'PK', ['PK_INVOICE']), ...constraints('INVOICE', 'UQ', ['UQ_INVOICE_reservation', 'UQ_INVOICE_number']),
  ...constraints('INVOICE', 'F', ['FK_INVOICE_RESERVATION', 'FK_INVOICE_ADMIN']),
  ...constraints('INVOICE', 'D', ['DF_INVOICE_issued', 'DF_INVOICE_status', 'DF_INVOICE_discount', 'DF_INVOICE_created']),
  ...constraints('INVOICE', 'C', ['CK_INVOICE_status', 'CK_INVOICE_amounts']),
  ...constraints('INVOICE_ITEM', 'PK', ['PK_INVOICE_ITEM']), ...constraints('INVOICE_ITEM', 'F', ['FK_INVOICE_ITEM_INVOICE']),
  ...constraints('INVOICE_ITEM', 'C', ['CK_INVOICE_ITEM_values', 'CK_INVOICE_ITEM_type']),
  ...constraints('ADMIN_AUDIT_LOG', 'PK', ['PK_ADMIN_AUDIT_LOG']), ...constraints('ADMIN_AUDIT_LOG', 'F', ['FK_ADMIN_AUDIT_LOG_ADMIN']),
  ...constraints('ADMIN_AUDIT_LOG', 'D', ['DF_ADMIN_AUDIT_LOG_created']),
  ...constraints('ADMIN_AUDIT_LOG', 'C', ['CK_ADMIN_AUDIT_LOG_old_json', 'CK_ADMIN_AUDIT_LOG_new_json']),
  ...constraints('PAYMENT_PROOF', 'PK', ['PK_PAYMENT_PROOF']),
  ...constraints('PAYMENT_PROOF', 'F', ['FK_PAYMENT_PROOF_RESERVATION', 'FK_PAYMENT_PROOF_CUSTOMER', 'FK_PAYMENT_PROOF_PAYMENT', 'FK_PAYMENT_PROOF_TRANSACTION', 'FK_PAYMENT_PROOF_INVOICE', 'FK_PAYMENT_PROOF_REVIEWER']),
  ...constraints('PAYMENT_PROOF', 'D', ['DF_PAYMENT_PROOF_status', 'DF_PAYMENT_PROOF_created', 'DF_PAYMENT_PROOF_updated']),
  ...constraints('PAYMENT_PROOF', 'C', ['CK_PAYMENT_PROOF_method', 'CK_PAYMENT_PROOF_status', 'CK_PAYMENT_PROOF_amount', 'CK_PAYMENT_PROOF_byte_size', 'CK_PAYMENT_PROOF_reference', 'CK_PAYMENT_PROOF_review']),
  ...constraints('BOOKING_STATUS_HISTORY', 'PK', ['PK_BOOKING_STATUS_HISTORY']),
  ...constraints('BOOKING_STATUS_HISTORY', 'F', ['FK_BOOKING_STATUS_HISTORY_RESERVATION']),
  ...constraints('BOOKING_STATUS_HISTORY', 'D', ['DF_BOOKING_STATUS_HISTORY_created']),
  ...constraints('BOOKING_STATUS_HISTORY', 'C', ['CK_BOOKING_STATUS_HISTORY_actor', 'CK_BOOKING_STATUS_HISTORY_actor_id']),
  ...constraints('EMAIL_OUTBOX', 'PK', ['PK_EMAIL_OUTBOX']),
  ...constraints('EMAIL_OUTBOX', 'D', ['DF_EMAIL_OUTBOX_status', 'DF_EMAIL_OUTBOX_attempt_count', 'DF_EMAIL_OUTBOX_created', 'DF_EMAIL_OUTBOX_updated']),
  ...constraints('EMAIL_OUTBOX', 'C', ['CK_EMAIL_OUTBOX_payload', 'CK_EMAIL_OUTBOX_status', 'CK_EMAIL_OUTBOX_attempt_count', 'CK_EMAIL_OUTBOX_related_entity', 'CK_EMAIL_OUTBOX_sent_at']),
  ...constraints('PASSWORD_RESET_TOKEN', 'PK', ['PK_PASSWORD_RESET_TOKEN']),
  ...constraints('PASSWORD_RESET_TOKEN', 'UQ', ['UQ_PASSWORD_RESET_TOKEN_selector', 'UQ_PASSWORD_RESET_TOKEN_hash']),
  ...constraints('PASSWORD_RESET_TOKEN', 'F', ['FK_PASSWORD_RESET_TOKEN_CUSTOMER', 'FK_PASSWORD_RESET_TOKEN_ADMIN']),
  ...constraints('PASSWORD_RESET_TOKEN', 'D', ['DF_PASSWORD_RESET_TOKEN_created']),
  ...constraints('PASSWORD_RESET_TOKEN', 'C', ['CK_PASSWORD_RESET_TOKEN_principal']),
  ...constraints('CUSTOM_EVENT_REQUEST', 'PK', ['PK_CUSTOM_EVENT_REQUEST']),
  ...constraints('CUSTOM_EVENT_REQUEST', 'UQ', ['UQ_CUSTOM_EVENT_REQUEST_reservation']),
  ...constraints('CUSTOM_EVENT_REQUEST', 'F', ['FK_CUSTOM_EVENT_REQUEST_RESERVATION', 'FK_CUSTOM_EVENT_REQUEST_SOURCE_PACKAGE']),
  ...constraints('CUSTOM_EVENT_REQUEST', 'D', ['DF_CUSTOM_EVENT_REQUEST_status', 'DF_CUSTOM_EVENT_REQUEST_created', 'DF_CUSTOM_EVENT_REQUEST_updated']),
  ...constraints('CUSTOM_EVENT_REQUEST', 'C', ['CK_CUSTOM_EVENT_REQUEST_budget', 'CK_CUSTOM_EVENT_REQUEST_status']),
  ...constraints('CUSTOM_QUOTE', 'PK', ['PK_CUSTOM_QUOTE']),
  ...constraints('CUSTOM_QUOTE', 'UQ', ['UQ_CUSTOM_QUOTE_request_version']),
  ...constraints('CUSTOM_QUOTE', 'F', ['FK_CUSTOM_QUOTE_REQUEST', 'FK_CUSTOM_QUOTE_SENDER']),
  ...constraints('CUSTOM_QUOTE', 'D', ['DF_CUSTOM_QUOTE_discount', 'DF_CUSTOM_QUOTE_status', 'DF_CUSTOM_QUOTE_created']),
  ...constraints('CUSTOM_QUOTE', 'C', ['CK_CUSTOM_QUOTE_version', 'CK_CUSTOM_QUOTE_amounts', 'CK_CUSTOM_QUOTE_status']),
  ...constraints('CUSTOM_QUOTE_ITEM', 'PK', ['PK_CUSTOM_QUOTE_ITEM']),
  ...constraints('CUSTOM_QUOTE_ITEM', 'UQ', ['UQ_CUSTOM_QUOTE_ITEM_order']),
  ...constraints('CUSTOM_QUOTE_ITEM', 'F', ['FK_CUSTOM_QUOTE_ITEM_QUOTE']),
  ...constraints('CUSTOM_QUOTE_ITEM', 'C', ['CK_CUSTOM_QUOTE_ITEM_values']),
];

function index(table: string, name: string, keys: string[], includes: string[] = [], unique = false, filter: string | null = null): IndexShape {
  return { table, name, unique, keys, includes, filter };
}

const indexes: IndexShape[] = [
  index('CUSTOMER', 'IX_CUSTOMER_status', ['status']),
  index('PACKAGE', 'IX_PACKAGE_event_id', ['event_id']),
  index('PACKAGE', 'IX_PACKAGE_active_event', ['is_active', 'event_id'], ['pricing_type', 'price_per_head', 'base_price', 'included_guests', 'excess_guest_price', 'min_guest', 'max_guest']),
  index('MENU_ITEM', 'IX_MENU_ITEM_package_id', ['package_id']),
  index('RESERVATION', 'IX_RESERVATION_customer_id', ['customer_id']),
  index('RESERVATION', 'IX_RESERVATION_event_id', ['event_id']),
  index('RESERVATION', 'IX_RESERVATION_event_date', ['event_date']),
  index('RESERVATION', 'IX_RESERVATION_status', ['status']),
  index('RESERVATION', 'UX_RESERVATION_booking_reference', ['booking_reference'], [], true, 'booking_reference is not null'),
  index('RESERVATION', 'IX_RESERVATION_customer_event', ['customer_id', 'event_date'], ['status', 'total_amount']),
  index('RESERVATION', 'IX_RESERVATION_status_created', ['status', 'created_at']),
  index('RESERVATION', 'IX_RESERVATION_event_capacity', ['event_date', 'status'], ['guest_count']),
  index('BOOKING_POLICY', 'IX_BOOKING_POLICY_payment_due', ['stage', 'payment_due_at'], ['hold_status', 'review_required']),
  index('BOOKING_POLICY', 'IX_BOOKING_POLICY_review_target', ['stage', 'review_target_at'], ['review_required']),
  index('BOOKING_POLICY', 'IX_BOOKING_POLICY_verification_due', ['verification_due_at'], ['stage', 'preparation_cutoff_at', 'hold_status']),
  index('PAYMENT', 'IX_PAYMENT_admin_id', ['admin_id']),
  index('PAYMENT', 'IX_PAYMENT_status', ['status']),
  index('NOTIFICATION', 'IX_NOTIFICATION_reservation_id', ['reservation_id']),
  index('AUTH_SESSION', 'IX_AUTH_SESSION_customer_expiry', ['customer_id', 'expires_at']),
  index('ADMIN_SESSION', 'IX_ADMIN_SESSION_admin_expiry', ['admin_id', 'expires_at']),
  index('AUTH_SECURITY_EVENT', 'IX_AUTH_SECURITY_EVENT_created', ['created_at']),
  index('EMAIL_VERIFICATION_CHALLENGE', 'IX_EMAIL_VERIFICATION_CHALLENGE_expiry', ['expires_at']),
  index('AUTH_LOGIN_ATTEMPT', 'IX_AUTH_LOGIN_ATTEMPT_window', ['window_started_at'], ['blocked_until']),
  index('PAYMENT_TRANSACTION', 'IX_PAYMENT_TRANSACTION_payment_date', ['payment_date']),
  index('PAYMENT_TRANSACTION', 'UX_PAYMENT_TRANSACTION_reference', ['payment_method', 'transaction_ref'], [], true, 'transaction_ref is not null'),
  index('INVOICE_ITEM', 'IX_INVOICE_ITEM_invoice', ['invoice_id']),
  index('ADMIN_AUDIT_LOG', 'IX_ADMIN_AUDIT_LOG_admin_created', ['admin_id', 'created_at']),
  index('ADMIN_AUDIT_LOG', 'IX_ADMIN_AUDIT_LOG_entity', ['entity_type', 'entity_id', 'created_at']),
  index('PAYMENT_PROOF', 'UX_PAYMENT_PROOF_active_reference', ['transaction_reference'], [], true, 'transaction_reference is not null'),
  index('PAYMENT_PROOF', 'IX_PAYMENT_PROOF_status_created', ['status', 'created_at'], ['reservation_id', 'customer_id', 'claimed_amount']),
  index('PAYMENT_PROOF', 'IX_PAYMENT_PROOF_reservation_created', ['reservation_id', 'created_at']),
  index('BOOKING_STATUS_HISTORY', 'IX_BOOKING_STATUS_HISTORY_reservation_created', ['reservation_id', 'created_at']),
  index('EMAIL_OUTBOX', 'IX_EMAIL_OUTBOX_status_next_attempt', ['status', 'next_attempt_at', 'created_at'], ['attempt_count']),
  index('EMAIL_OUTBOX', 'IX_EMAIL_OUTBOX_related_entity', ['related_entity_type', 'related_entity_id', 'created_at']),
  index('PASSWORD_RESET_TOKEN', 'IX_PASSWORD_RESET_TOKEN_customer_created', ['customer_id', 'created_at'], ['expires_at', 'used_at', 'invalidated_at'], false, 'customer_id is not null'),
  index('PASSWORD_RESET_TOKEN', 'IX_PASSWORD_RESET_TOKEN_admin_created', ['admin_id', 'created_at'], ['expires_at', 'used_at', 'invalidated_at'], false, 'admin_id is not null'),
  index('PASSWORD_RESET_TOKEN', 'IX_PASSWORD_RESET_TOKEN_expiry', ['expires_at'], ['used_at', 'invalidated_at']),
  index('CUSTOM_EVENT_REQUEST', 'IX_CUSTOM_EVENT_REQUEST_status_created', ['status', 'created_at'], ['reservation_id', 'source_package_id', 'target_budget', 'updated_at']),
  index('CUSTOM_QUOTE', 'IX_CUSTOM_QUOTE_request_status', ['request_id', 'status'], ['version', 'total_amount', 'required_down_payment', 'valid_until', 'sent_at', 'created_at']),
  index('CUSTOM_QUOTE_ITEM', 'IX_CUSTOM_QUOTE_ITEM_quote_order', ['quote_id', 'sort_order'], ['description', 'quantity', 'unit_price', 'line_total']),
];

export const EXPECTED_SCHEMA_CONTRACT: Omit<SchemaSnapshot, 'migrations'> = {
  tables: [...new Set(columns.map((item) => item.table))].sort(),
  columns,
  constraints: constraintShapes,
  indexes,
  sequences: [{ name: 'INVOICE_NUMBER_SEQUENCE', type: 'bigint', increment: 1 }],
};

function normalizedFilter(value: string | null): string | null {
  if (value === null) return null;
  return value.toLowerCase().replace(/[\[\]()]/g, '').replace(/\s+/g, ' ').trim();
}

function columnDisplay(columnShape: ColumnShape): string {
  let type = columnShape.type;
  if (type === 'nvarchar' || type === 'char') {
    const length = columnShape.maxLength === -1 ? 'max' : type === 'nvarchar' ? String(columnShape.maxLength / 2) : String(columnShape.maxLength);
    type = `${type}(${length})`;
  } else if (type === 'decimal') {
    type = `${type}(${columnShape.precision},${columnShape.scale})`;
  } else if (type === 'datetime2' || type === 'time') {
    type = `${type}(${columnShape.scale})`;
  }
  return `${type} ${columnShape.nullable ? 'NULL' : 'NOT NULL'}${columnShape.identity ? ' IDENTITY' : ''}`;
}

function sameColumn(actual: ColumnShape, expected: ColumnShape): boolean {
  return actual.type === expected.type
    && actual.maxLength === expected.maxLength
    && actual.precision === expected.precision
    && actual.scale === expected.scale
    && actual.nullable === expected.nullable
    && actual.identity === expected.identity;
}

function sameIndex(actual: IndexShape, expected: IndexShape): boolean {
  return actual.unique === expected.unique
    && actual.keys.join(',') === expected.keys.join(',')
    && actual.includes.join(',') === expected.includes.join(',')
    && normalizedFilter(actual.filter) === normalizedFilter(expected.filter);
}

export function findSchemaContractViolations(
  snapshot: SchemaSnapshot,
  options: SchemaContractOptions = { migrationHistory: 'compatible' },
): string[] {
  const migrationViolations: string[] = [];
  const actualMigrations = new Set(snapshot.migrations);
  for (const migration of EXPECTED_MIGRATIONS) {
    if (!actualMigrations.has(migration)) migrationViolations.push(`dbo.SCHEMA_MIGRATION.${migration}: missing migration`);
  }
  for (const migration of snapshot.migrations) {
    const allowedHistorical = options.migrationHistory === 'compatible' && HISTORICAL_COMPATIBLE_MIGRATIONS.has(migration);
    if (!EXPECTED_MIGRATIONS.includes(migration) && !allowedHistorical) {
      migrationViolations.push(`dbo.SCHEMA_MIGRATION.${migration}: unexpected migration`);
    }
  }
  migrationViolations.sort();

  const tableViolations = EXPECTED_SCHEMA_CONTRACT.tables
    .filter((table) => !snapshot.tables.includes(table))
    .map((table) => `dbo.${table}: missing table`)
    .sort();

  const columnViolations: string[] = [];
  for (const expected of EXPECTED_SCHEMA_CONTRACT.columns) {
    const actual = snapshot.columns.find((item) => item.table === expected.table && item.name === expected.name);
    if (!actual) columnViolations.push(`dbo.${expected.table}.${expected.name}: missing column`);
    else if (!sameColumn(actual, expected)) {
      columnViolations.push(`dbo.${expected.table}.${expected.name}: incompatible column (expected ${columnDisplay(expected)})`);
    }
  }
  columnViolations.sort();

  const constraintViolations: string[] = [];
  for (const expected of EXPECTED_SCHEMA_CONTRACT.constraints) {
    if (!snapshot.constraints.some((item) => item.table === expected.table && item.name === expected.name && item.type === expected.type)) {
      constraintViolations.push(`dbo.${expected.table}.${expected.name}: missing ${expected.type} constraint`);
    }
  }
  constraintViolations.sort();

  const indexViolations: string[] = [];
  for (const expected of EXPECTED_SCHEMA_CONTRACT.indexes) {
    const actual = snapshot.indexes.find((item) => item.table === expected.table && item.name === expected.name);
    if (!actual) indexViolations.push(`dbo.${expected.table}.${expected.name}: missing index`);
    else if (!sameIndex(actual, expected)) indexViolations.push(`dbo.${expected.table}.${expected.name}: incompatible index`);
  }
  indexViolations.sort();

  const sequenceViolations: string[] = [];
  for (const expected of EXPECTED_SCHEMA_CONTRACT.sequences) {
    const actual = snapshot.sequences.find((item) => item.name === expected.name);
    if (!actual) sequenceViolations.push(`dbo.${expected.name}: missing sequence`);
    else if (actual.type !== expected.type || actual.increment !== expected.increment) {
      sequenceViolations.push(`dbo.${expected.name}: incompatible sequence`);
    }
  }
  sequenceViolations.sort();

  return [
    ...migrationViolations,
    ...tableViolations,
    ...columnViolations,
    ...constraintViolations,
    ...indexViolations,
    ...sequenceViolations,
  ];
}

interface CatalogRecordsets {
  recordsets: Array<Array<Record<string, unknown>>>;
}

function stringList(value: unknown): string[] {
  return typeof value === 'string' && value.length > 0 ? value.split(',') : [];
}

export async function loadSchemaSnapshot(pool: sql.ConnectionPool): Promise<SchemaSnapshot> {
  const result = await pool.request().query(`
    SET NOCOUNT ON;
    SELECT migration_name FROM dbo.SCHEMA_MIGRATION ORDER BY migration_name;
    SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo') ORDER BY name;
    SELECT t.name table_name,c.name column_name,ty.name type_name,c.max_length,c.precision,c.scale,c.is_nullable,
      CONVERT(bit,CASE WHEN ic.column_id IS NULL THEN 0 ELSE 1 END) is_identity
    FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    LEFT JOIN sys.identity_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id
    WHERE t.schema_id=SCHEMA_ID('dbo') ORDER BY t.name,c.column_id;
    SELECT constraint_data.table_name,constraint_data.name,constraint_data.type
    FROM (
      SELECT t.name table_name,k.name,k.type
      FROM sys.key_constraints k JOIN sys.tables t ON t.object_id=k.parent_object_id
      WHERE t.schema_id=SCHEMA_ID('dbo')
      UNION ALL
      SELECT t.name table_name,f.name,CAST('F' AS char(2)) type
      FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id
      WHERE t.schema_id=SCHEMA_ID('dbo') AND EXISTS(
        SELECT 1 FROM sys.foreign_key_columns fc WHERE fc.constraint_object_id=f.object_id
      )
      UNION ALL
      SELECT t.name table_name,c.name,CAST('C' AS char(2)) type
      FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id
      WHERE t.schema_id=SCHEMA_ID('dbo')
      UNION ALL
      SELECT t.name table_name,d.name,CAST('D' AS char(2)) type
      FROM sys.default_constraints d JOIN sys.tables t ON t.object_id=d.parent_object_id
      WHERE t.schema_id=SCHEMA_ID('dbo')
    ) constraint_data
    ORDER BY constraint_data.table_name,constraint_data.name;
    SELECT t.name table_name,i.name,i.is_unique,i.filter_definition,
      keys.key_columns,includes.included_columns
    FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id
    OUTER APPLY(SELECT STRING_AGG(c.name,',') WITHIN GROUP(ORDER BY ic.key_ordinal) key_columns
      FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.is_included_column=0) keys
    OUTER APPLY(SELECT STRING_AGG(c.name,',') WITHIN GROUP(ORDER BY ic.index_column_id) included_columns
      FROM sys.index_columns ic JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
      WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.is_included_column=1) includes
    WHERE t.schema_id=SCHEMA_ID('dbo') AND i.name IS NOT NULL AND i.is_primary_key=0 AND i.is_unique_constraint=0
    ORDER BY t.name,i.name;
    SELECT s.name,ty.name type_name,s.increment
    FROM sys.sequences s JOIN sys.types ty ON ty.user_type_id=s.user_type_id
    WHERE s.schema_id=SCHEMA_ID('dbo') ORDER BY s.name;
  `) as unknown as CatalogRecordsets;

  const [migrationRows = [], tableRows = [], columnRows = [], constraintRows = [], indexRows = [], sequenceRows = []] = result.recordsets;
  return {
    migrations: migrationRows.map((row) => String(row['migration_name'])),
    tables: tableRows.map((row) => String(row['name'])),
    columns: columnRows.map((row) => ({
      table: String(row['table_name']), name: String(row['column_name']), type: String(row['type_name']),
      maxLength: Number(row['max_length']), precision: Number(row['precision']), scale: Number(row['scale']),
      nullable: Boolean(row['is_nullable']), identity: Boolean(row['is_identity']),
    })),
    constraints: constraintRows.map((row) => ({
      table: String(row['table_name']), name: String(row['name']), type: String(row['type']).trim() as ConstraintShape['type'],
    })),
    indexes: indexRows.map((row) => ({
      table: String(row['table_name']), name: String(row['name']), unique: Boolean(row['is_unique']),
      keys: stringList(row['key_columns']), includes: stringList(row['included_columns']),
      filter: row['filter_definition'] === null ? null : String(row['filter_definition']),
    })),
    sequences: sequenceRows.map((row) => ({
      name: String(row['name']), type: String(row['type_name']), increment: Number(row['increment']),
    })),
  };
}

export async function assertCurrentSchema(
  pool: sql.ConnectionPool,
  options: SchemaContractOptions = { migrationHistory: 'compatible' },
): Promise<void> {
  const violations = findSchemaContractViolations(await loadSchemaSnapshot(pool), options);
  if (violations.length > 0) throw new Error(`Database schema contract failed:\n${violations.join('\n')}`);
}
