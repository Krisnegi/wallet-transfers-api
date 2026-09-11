import { db } from '../db/index.js';
import { NotFoundError } from '../errors/AppError.js';

export interface PaginationQueryParams {
  page?: number;
  limit?: number;
}

export interface TransactionDTO {
  id: string;
  accountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  reference: string;
  counterpartyAccountId: string | null;
  balanceAfter: number;
  createdAt: Date;
}

export interface PaginatedTransactionsResponse {
  data: TransactionDTO[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export class TransactionService {
  /**
   * Fetches paginated transaction history for a specified account ID, newest first.
   */
  public static async getAccountTransactions(
    accountId: string,
    params: PaginationQueryParams
  ): Promise<PaginatedTransactionsResponse> {
    // 1. Verify account exists
    const accountExists = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', accountId)
      .executeTakeFirst();

    if (!accountExists) {
      throw new NotFoundError(`Account with ID '${accountId}' was not found.`);
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // 2. Count total transactions for account
    const countResult = await db
      .selectFrom('transactions')
      .select(db.fn.count<string>('id').as('total'))
      .where('account_id', '=', accountId)
      .executeTakeFirst();

    const totalCount = parseInt(countResult?.total || '0', 10);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // 3. Fetch paginated transactions ordered by created_at DESC (using composite index)
    const records = await db
      .selectFrom('transactions')
      .selectAll()
      .where('account_id', '=', accountId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const data: TransactionDTO[] = records.map((tx) => ({
      id: tx.id,
      accountId: tx.account_id,
      type: tx.type,
      amount: Number(tx.amount),
      reference: tx.reference,
      counterpartyAccountId: tx.counterparty_account_id,
      balanceAfter: Number(tx.balance_after),
      createdAt: tx.created_at,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    };
  }
}
