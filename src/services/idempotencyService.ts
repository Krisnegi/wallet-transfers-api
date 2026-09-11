import crypto from 'crypto';
import { Transaction, Kysely } from 'kysely';
import { Database } from '../db/index.js';
import { IdempotencyConflictError } from '../errors/AppError.js';

export interface StoredIdempotencyRecord {
  statusCode: number;
  responseBody: unknown;
}

export class IdempotencyService {
  /**
   * Generates a deterministic SHA-256 hash for a given request path and body payload.
   */
  public static generateRequestHash(path: string, body: unknown): string {
    const payload = JSON.stringify({
      path,
      body: body || {},
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Checks if an idempotency key has already been processed.
   * - If key exists and request hash matches: returns stored response.
   * - If key exists and request hash differs: throws IdempotencyConflictError (HTTP 409).
   * - If key does not exist: returns null.
   */
  public static async getStoredResponse(
    executor: Kysely<Database> | Transaction<Database>,
    key: string,
    path: string,
    body: unknown
  ): Promise<StoredIdempotencyRecord | null> {
    const record = await executor
      .selectFrom('idempotency_keys')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();

    if (!record) {
      return null;
    }

    const currentHash = this.generateRequestHash(path, body);

    if (record.request_hash !== currentHash) {
      throw new IdempotencyConflictError(
        'Idempotency key reused with a different request body or payload'
      );
    }

    return {
      statusCode: record.status_code,
      responseBody: record.response_body,
    };
  }

  /**
   * Saves the result of an idempotent operation inside the database transaction.
   */
  public static async saveResponse(
    executor: Kysely<Database> | Transaction<Database>,
    key: string,
    path: string,
    body: unknown,
    statusCode: number,
    responseBody: unknown
  ): Promise<void> {
    const requestHash = this.generateRequestHash(path, body);

    await executor
      .insertInto('idempotency_keys')
      .values({
        key,
        request_path: path,
        request_hash: requestHash,
        status_code: statusCode,
        response_body: JSON.stringify(responseBody),
      })
      .execute();
  }
}
