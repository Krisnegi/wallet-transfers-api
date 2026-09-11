import { db } from '../db/index.js';
import {
  NotFoundError,
  InsufficientFundsError,
  CurrencyMismatchError,
  BadRequestError,
} from '../errors/AppError.js';
import { IdempotencyService } from './idempotencyService.js';

export interface CreditDTO {
  accountId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
  requestPath: string;
  requestBody: unknown;
}

export interface DebitDTO {
  accountId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
  requestPath: string;
  requestBody: unknown;
}

export interface TransferDTO {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference: string;
  idempotencyKey: string;
  requestPath: string;
  requestBody: unknown;
}

export interface SingleTransactionResponse {
  transactionId: string;
  accountId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  reference: string;
  balanceAfter: number;
  createdAt: Date;
}

export interface TransferResponse {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  reference: string;
  fromBalanceAfter: number;
  toBalanceAfter: number;
  createdAt: Date;
}

export interface ServiceExecutionResult<T> {
  statusCode: number;
  data: T;
}

export class TransferService {
  /**
   * Adds money to an account (CREDIT operation).
   * Atomically logs transaction and saves idempotency state.
   */
  public static async credit(
    dto: CreditDTO
  ): Promise<ServiceExecutionResult<SingleTransactionResponse>> {
    return await db.transaction().execute(async (trx) => {
      // 1. Lock account row FOR UPDATE first to serialize concurrent requests for this account
      const account = await trx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', dto.accountId)
        .forUpdate()
        .executeTakeFirst();

      if (!account) {
        throw new NotFoundError(`Account with ID '${dto.accountId}' was not found.`);
      }

      // 2. Check idempotency replay inside locked account transaction
      const stored = await IdempotencyService.getStoredResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody
      );
      if (stored) {
        return {
          statusCode: stored.statusCode,
          data: stored.responseBody as SingleTransactionResponse,
        };
      }

      const currentBalance = BigInt(account.balance);
      const creditAmount = BigInt(dto.amount);
      const newBalance = currentBalance + creditAmount;

      // 3. Update account balance
      await trx
        .updateTable('accounts')
        .set({
          balance: newBalance.toString(),
          updated_at: new Date(),
        })
        .where('id', '=', dto.accountId)
        .execute();

      // 4. Record immutable transaction log
      const txRecord = await trx
        .insertInto('transactions')
        .values({
          account_id: dto.accountId,
          type: 'CREDIT',
          amount: creditAmount.toString(),
          reference: dto.reference,
          counterparty_account_id: null,
          balance_after: newBalance.toString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response: SingleTransactionResponse = {
        transactionId: txRecord.id,
        accountId: txRecord.account_id,
        type: 'CREDIT',
        amount: Number(creditAmount),
        reference: txRecord.reference,
        balanceAfter: Number(newBalance),
        createdAt: txRecord.created_at,
      };

      const statusCode = 200;

      // 5. Persist idempotency result
      await IdempotencyService.saveResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody,
        statusCode,
        response
      );

      return {
        statusCode,
        data: response,
      };
    });
  }

  /**
   * Removes money from an account (DEBIT operation).
   * Locks account FOR UPDATE and rejects if balance would drop below zero.
   */
  public static async debit(
    dto: DebitDTO
  ): Promise<ServiceExecutionResult<SingleTransactionResponse>> {
    return await db.transaction().execute(async (trx) => {
      // 1. Lock account row FOR UPDATE first to serialize concurrent requests for this account
      const account = await trx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', dto.accountId)
        .forUpdate()
        .executeTakeFirst();

      if (!account) {
        throw new NotFoundError(`Account with ID '${dto.accountId}' was not found.`);
      }

      // 2. Check idempotency replay inside locked account transaction
      const stored = await IdempotencyService.getStoredResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody
      );
      if (stored) {
        return {
          statusCode: stored.statusCode,
          data: stored.responseBody as SingleTransactionResponse,
        };
      }

      const currentBalance = BigInt(account.balance);
      const debitAmount = BigInt(dto.amount);

      if (currentBalance < debitAmount) {
        throw new InsufficientFundsError(
          `Insufficient funds: current balance is ${currentBalance} minor units, requested debit is ${debitAmount}`
        );
      }

      const newBalance = currentBalance - debitAmount;

      // 3. Update account balance
      await trx
        .updateTable('accounts')
        .set({
          balance: newBalance.toString(),
          updated_at: new Date(),
        })
        .where('id', '=', dto.accountId)
        .execute();

      // 4. Record immutable transaction log
      const txRecord = await trx
        .insertInto('transactions')
        .values({
          account_id: dto.accountId,
          type: 'DEBIT',
          amount: debitAmount.toString(),
          reference: dto.reference,
          counterparty_account_id: null,
          balance_after: newBalance.toString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response: SingleTransactionResponse = {
        transactionId: txRecord.id,
        accountId: txRecord.account_id,
        type: 'DEBIT',
        amount: Number(debitAmount),
        reference: txRecord.reference,
        balanceAfter: Number(newBalance),
        createdAt: txRecord.created_at,
      };

      const statusCode = 200;

      // 5. Persist idempotency result
      await IdempotencyService.saveResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody,
        statusCode,
        response
      );

      return {
        statusCode,
        data: response,
      };
    });
  }

  /**
   * Transfers money atomically between two accounts.
   * Uses deterministic lock ordering (sorted IDs) to guarantee deadlock prevention.
   */
  public static async transfer(
    dto: TransferDTO
  ): Promise<ServiceExecutionResult<TransferResponse>> {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestError('Cannot transfer money to the same account');
    }

    return await db.transaction().execute(async (trx) => {
      // 1. Deterministic Lock Ordering: Sort account IDs to prevent deadlocks under race conditions
      const lockOrder = [dto.fromAccountId, dto.toAccountId].sort();
      const firstAccountId = lockOrder[0]!;
      const secondAccountId = lockOrder[1]!;

      // Lock first account
      const firstAccount = await trx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', firstAccountId)
        .forUpdate()
        .executeTakeFirst();

      // Lock second account
      const secondAccount = await trx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', secondAccountId)
        .forUpdate()
        .executeTakeFirst();

      // Resolve accounts to sender and recipient
      const fromAccount =
        firstAccountId === dto.fromAccountId ? firstAccount : secondAccount;
      const toAccount =
        firstAccountId === dto.toAccountId ? firstAccount : secondAccount;

      if (!fromAccount) {
        throw new NotFoundError(`Sender account '${dto.fromAccountId}' was not found.`);
      }
      if (!toAccount) {
        throw new NotFoundError(`Recipient account '${dto.toAccountId}' was not found.`);
      }

      // 2. Check idempotency replay inside locked accounts transaction
      const stored = await IdempotencyService.getStoredResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody
      );
      if (stored) {
        return {
          statusCode: stored.statusCode,
          data: stored.responseBody as TransferResponse,
        };
      }

      // 3. Currency mismatch check
      if (fromAccount.currency !== toAccount.currency) {
        throw new CurrencyMismatchError(
          `Currency mismatch: sender currency is '${fromAccount.currency}', recipient currency is '${toAccount.currency}'`
        );
      }

      // 4. Balance check on sender
      const fromBalance = BigInt(fromAccount.balance);
      const transferAmount = BigInt(dto.amount);

      if (fromBalance < transferAmount) {
        throw new InsufficientFundsError(
          `Insufficient balance for transfer: available ${fromBalance} minor units, requested ${transferAmount}`
        );
      }

      const fromNewBalance = fromBalance - transferAmount;
      const toNewBalance = BigInt(toAccount.balance) + transferAmount;
      const now = new Date();

      // 5. Update sender and recipient balances
      await trx
        .updateTable('accounts')
        .set({ balance: fromNewBalance.toString(), updated_at: now })
        .where('id', '=', dto.fromAccountId)
        .execute();

      await trx
        .updateTable('accounts')
        .set({ balance: toNewBalance.toString(), updated_at: now })
        .where('id', '=', dto.toAccountId)
        .execute();

      // 6. Record immutable transaction logs for both sides
      const fromTxRecord = await trx
        .insertInto('transactions')
        .values({
          account_id: dto.fromAccountId,
          type: 'DEBIT',
          amount: transferAmount.toString(),
          reference: dto.reference,
          counterparty_account_id: dto.toAccountId,
          balance_after: fromNewBalance.toString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('transactions')
        .values({
          account_id: dto.toAccountId,
          type: 'CREDIT',
          amount: transferAmount.toString(),
          reference: dto.reference,
          counterparty_account_id: dto.fromAccountId,
          balance_after: toNewBalance.toString(),
        })
        .execute();

      const response: TransferResponse = {
        transferId: fromTxRecord.id,
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: Number(transferAmount),
        reference: dto.reference,
        fromBalanceAfter: Number(fromNewBalance),
        toBalanceAfter: Number(toNewBalance),
        createdAt: fromTxRecord.created_at,
      };

      const statusCode = 200;

      // 7. Persist idempotency result
      await IdempotencyService.saveResponse(
        trx,
        dto.idempotencyKey,
        dto.requestPath,
        dto.requestBody,
        statusCode,
        response
      );

      return {
        statusCode,
        data: response,
      };
    });
  }
}
