import { Kysely, PostgresDialect, Generated } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';

// PostgreSQL return BIGINT values as strings to avoid JavaScript precision loss.
// Parse int8 (BIGINT) as string or BigInt safely.
pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => val);

export interface AccountsTable {
  id: Generated<string>;
  owner_name: string;
  currency: string;
  balance: Generated<string>; // Stored in minor units (e.g. integer 50000 = ₹500.00)
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TransactionsTable {
  id: Generated<string>;
  account_id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string; // Minor units
  reference: string;
  counterparty_account_id: string | null;
  balance_after: string;
  created_at: Generated<Date>;
}

export interface IdempotencyKeysTable {
  key: string;
  request_path: string;
  request_hash: string;
  status_code: number;
  response_body: unknown;
  created_at: Generated<Date>;
}

export interface Database {
  accounts: AccountsTable;
  transactions: TransactionsTable;
  idempotency_keys: IdempotencyKeysTable;
}

export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  min: config.db.poolMin,
  max: config.db.poolMax,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});
