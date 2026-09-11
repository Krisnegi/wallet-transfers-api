# Wallet & Transfers API

A robust, production-ready backend HTTP API for managing digital wallet accounts, recording immutable financial ledgers, and executing atomic money transfers with high-concurrency correctness, deadlock prevention, and strict idempotency guarantees.

---

## 1. Setup & Execution Instructions

### Prerequisites
- **Node.js**: v20 or later (`node -v`)
- **Docker & Docker Compose**: For containerized PostgreSQL database

### Step-by-Step Commands

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start PostgreSQL Database Container:**
   ```bash
   docker compose up -d
   ```
   *(PostgreSQL 16 Alpine container starts locally on `localhost:5432` using default development environment variables from `.env.example`: database `wallet_db`, user `wallet_user`, password `wallet_password`. Production environments load secrets from environment variables)*

3. **Run Database Migrations:**
   ```bash
   npm run migrate
   ```

4. **Start Application Server:**
   - **Development Mode** (with hot-reload):
     ```bash
     npm run dev
     ```
   - **Production Build & Start:**
     ```bash
     npm run build
     npm start
     ```
   *(Server runs on `http://localhost:3000`)*

5. **Execute Automated Test Suite & Concurrency Stress Tests:**
   ```bash
   npm test
   ```
   *(Runs all 33 unit, integration, and high-concurrency race condition test cases via Vitest)*

6. **TypeScript Strict Type Check:**
   ```bash
   npm run typecheck
   ```

---

## 2. Database Schema & Data Modelling Rationale

The database schema is managed via **Kysely** TypeScript SQL query builder and version-controlled migration files ([`src/db/migrations/001_create_tables.ts`](file:///Users/krisnegi/Desktop/Personal/interview%20projects/wallet-transfers-api/src/db/migrations/001_create_tables.ts)).

### Tables & Schema Design

#### `accounts`
- `id` (`UUID`, Primary Key, Default `gen_random_uuid()`)
- `owner_name` (`VARCHAR(255)`, NOT NULL)
- `currency` (`VARCHAR(3)`, NOT NULL)
- `balance` (`BIGINT`, NOT NULL, DEFAULT 0)
- `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `now()`)
- `updated_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `now()`)
- **Check Constraint:** `CONSTRAINT check_balance_non_negative CHECK (balance >= 0)`

**Rationale:** Balances are stored in minor units as 64-bit integers (`BIGINT`) to eliminate IEEE-754 floating-point rounding errors (e.g., ₹500.00 is stored as `50000`). Database-level `CHECK (balance >= 0)` serves as an absolute secondary safeguard preventing overdrawing.

#### `transactions`
- `id` (`UUID`, Primary Key, Default `gen_random_uuid()`)
- `account_id` (`UUID`, NOT NULL, Foreign Key to `accounts.id` ON DELETE CASCADE)
- `type` (`VARCHAR(10)`, NOT NULL, Check: `type IN ('CREDIT', 'DEBIT')`)
- `amount` (`BIGINT`, NOT NULL, Check: `amount > 0`)
- `reference` (`TEXT`, NOT NULL)
- `counterparty_account_id` (`UUID`, NULLABLE, Foreign Key to `accounts.id` ON DELETE SET NULL)
- `balance_after` (`BIGINT`, NOT NULL)
- `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `now()`)
- **Composite Index:** `idx_transactions_account_created_at` on `(account_id, created_at DESC)`

**Rationale:** Transaction records are strictly **append-only and immutable**. Every money movement logs the `balance_after` at that exact instant. For transfers, `counterparty_account_id` creates a double-entry audit trail linking sender and recipient entries.

#### `idempotency_keys`
- `key` (`VARCHAR(255)`, Primary Key)
- `request_path` (`VARCHAR(255)`, NOT NULL)
- `request_hash` (`VARCHAR(64)`, NOT NULL)
- `status_code` (`INTEGER`, NOT NULL)
- `response_body` (`JSONB`, NOT NULL)
- `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `now()`)

**Rationale:** Stores API response payloads and HTTP status codes keyed by the `Idempotency-Key` header. `request_hash` holds the SHA-256 digest of `(path + body)` to detect payload conflicts.

---

## 3. Concurrency & Deadlock Prevention Strategy

### Preventing Negative Balances Under Racing Requests
When concurrent requests arrive at the exact same millisecond trying to debit or transfer from an account:
1. All operations wrap inside an explicit database transaction (`db.transaction()`).
2. The account row is locked immediately using pessimistic row-level locking:
   ```sql
   SELECT * FROM accounts WHERE id = :id FOR UPDATE;
   ```
3. PostgreSQL serializes concurrent requests for that account row. Subsequent requests wait in queue.
4. When the next request acquires the row lock, it reads the updated balance. If `balance < requested_amount`, it is rejected with HTTP 400 `INSUFFICIENT_FUNDS`.
5. The DB check constraint `CHECK (balance >= 0)` guarantees that an account can never drop below zero even under raw query failure scenarios.

### Eliminating Deadlocks on Cross-Transfers
If User A transfers to User B (`A -> B`) while User B simultaneously transfers to User A (`B -> A`), locking `A` then `B` in one thread while locking `B` then `A` in another thread causes a classic database deadlock (`code 40P01`).

**Solution: Deterministic Sorted Lock Acquisition Order**
Before acquiring row locks, target account IDs are sorted lexicographically:
```ts
const lockOrder = [fromAccountId, toAccountId].sort();
```
Both concurrent transactions acquire row locks in the exact same physical order (`LEAST(from, to)` first, then `GREATEST(from, to)`). This mathematically eliminates circular wait conditions, guaranteeing zero database deadlocks under high load.

---

## 4. Balance Strategy (Stored vs. Derived Balance)

### Strategy Chosen: Stored Balance with Immutable Audit Ledger
We maintain an explicit `balance` column in the `accounts` table updated inside atomic transactions, complemented by an append-only `transactions` history table.

### Why Stored Balance Was Chosen:
1. **O(1) Query Performance:** Fetching an account balance (`GET /accounts/:id`) is an instant `O(1)` index lookup rather than an expensive `O(N)` aggregate `SUM(amount)` scan over millions of historical transaction rows.
2. **Database Invariant Enforcement:** Enables PostgreSQL to enforce `CHECK (balance >= 0)` directly at the storage layer.
3. **Auditability & Reconciliation:** Every transaction entry logs `balance_after`. The transaction history can be audited at any time to verify that:
   $$\text{Initial Balance} + \sum \text{CREDITs} - \sum \text{DEBITs} \equiv \text{Stored Balance}$$

---

## 5. Idempotency Architecture & Conflict Handling

All write endpoints (`/credit`, `/debit`, `/transfers`) require an `Idempotency-Key` header.

### Mechanism & Lifecycle:
1. **Payload Hashing:** Computes SHA-256 hash of `JSON.stringify({ path, body })`.
2. **Transactional Lookup:** Inside the locked transaction, queries `idempotency_keys` for `key`:
   - **Matching Key & Matching Hash:** Returns stored `statusCode` and `responseBody` immediately without re-executing money movement.
   - **Matching Key & Differing Hash:** Throws HTTP 409 `IDEMPOTENCY_CONFLICT` (*"Idempotency key reused with a different request payload"*).
   - **New Key:** Processes transaction, inserts record into `idempotency_keys` via `ON CONFLICT DO NOTHING`, and returns response.
3. **Thundering Herd Serialization:** Account row locking occurs **before** idempotency lookup, serializing simultaneous identical requests and preventing duplicate execution.

---

## 6. Tradeoffs & Future Scaling Considerations

### What Was Deliberately Left Out & Why:
- **Distributed Caching / Redis Locking:** PostgreSQL `FOR UPDATE` row locking provides absolute ACID consistency for a single-region database. For ultra-high horizontal scale (>10,000 writes/sec), a distributed lock (e.g., Redlock) or event-sourcing ledger (CQRS) would decouple lock contention from the primary database.
- **Authentication / API Keys:** Explicitly marked out of scope by assessment guidelines to focus 100% of effort on financial correctness, concurrency, and data modeling.
- **Swagger / OpenAPI Documentation:** Omitted as explicitly listed out of scope in assessment guidelines to prioritize core transactional correctness, locking, and test coverage.
- **Currency Conversion / Exchange Rates:** Enforced 1-to-1 matching currencies between accounts (`CURRENCY_MISMATCH` rejection), leaving out FX conversions as specified in guidelines.

### What I Would Do Differently With Another Week:
1. **Unique Account Identification (Email / Phone Number):** Currently, `POST /accounts` takes `ownerName` and `currency`, allowing duplicate accounts under the same owner name. I would add an `email` or `phone_number` column with unique index constraints (`UNIQUE (email, currency)`) to uniquely identify users and allow one account per currency.
2. **Idempotency Data Retention & Cleanup Worker:** Over time, the `idempotency_keys` table will accumulate significant data volume. I would implement a scheduled background cleanup worker (or PostgreSQL TTL/partitioning policy) to prune records older than 24–72 hours (e.g., `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '30 days'`).
3. **Transient Lock Wait Retries:** Add an automatic application-level retry wrapper (with exponential backoff and jitter) for transient DB lock wait timeouts (`55P03` / `40P01`).
4. **Monotonic Transaction Sequences:** Use database sequence numbers in addition to timestamps to guarantee absolute causal ordering during clock skew across distributed servers.
5. **Structured Audit Logging & Metrics:** Replace basic console logging with structured JSON logging (e.g., Pino) and Prometheus/OpenTelemetry metrics to track lock acquisition latency and API throughput in real-time.
6. **Event Streaming / Webhooks (Kafka / RabbitMQ):** Publish asynchronous domain events (e.g., `transfer.completed`, `account.credited`) to an event broker for downstream background tasks (email/SMS notifications, analytics, and fraud detection).
