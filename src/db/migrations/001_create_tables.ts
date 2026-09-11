import { Kysely, sql } from 'kysely';

// Kysely migration functions require Kysely<any> to execute DDL statements dynamically against un-instantiated DB schemas.
export async function up(db: Kysely<any>): Promise<void> {
  // 1. Create accounts table
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('currency', 'varchar(3)', (col) => col.notNull())
    .addColumn('balance', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add non-negative balance check constraint
  await sql`ALTER TABLE accounts ADD CONSTRAINT check_balance_non_negative CHECK (balance >= 0)`.execute(db);

  // 2. Create transactions table
  await db.schema
    .createTable('transactions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', (col) => col.notNull().references('accounts.id').onDelete('cascade'))
    .addColumn('type', 'varchar(10)', (col) => col.notNull())
    .addColumn('amount', 'bigint', (col) => col.notNull())
    .addColumn('reference', 'text', (col) => col.notNull())
    .addColumn('counterparty_account_id', 'uuid', (col) => col.references('accounts.id').onDelete('set null'))
    .addColumn('balance_after', 'bigint', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add check constraints for transaction type and positive amount
  await sql`ALTER TABLE transactions ADD CONSTRAINT check_transaction_type CHECK (type IN ('CREDIT', 'DEBIT'))`.execute(db);
  await sql`ALTER TABLE transactions ADD CONSTRAINT check_positive_amount CHECK (amount > 0)`.execute(db);

  // Add composite index for paginated transaction history queries
  await db.schema
    .createIndex('idx_transactions_account_created_at')
    .on('transactions')
    .columns(['account_id', 'created_at desc'])
    .execute();

  // 3. Create idempotency_keys table
  await db.schema
    .createTable('idempotency_keys')
    .addColumn('key', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('request_path', 'varchar(255)', (col) => col.notNull())
    .addColumn('request_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('status_code', 'integer', (col) => col.notNull())
    .addColumn('response_body', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('idempotency_keys').execute();
  await db.schema.dropTable('transactions').execute();
  await db.schema.dropTable('accounts').execute();
}
