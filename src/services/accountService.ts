import { db } from '../db/index.js';
import { NotFoundError } from '../errors/AppError.js';

export interface CreateAccountDTO {
  ownerName: string;
  currency: string;
}

export interface AccountResponseDTO {
  id: string;
  ownerName: string;
  currency: string;
  balance: number; // In minor units
  createdAt: Date;
  updatedAt: Date;
}

export class AccountService {
  /**
   * Creates a new wallet account with initial 0 balance.
   */
  public static async createAccount(dto: CreateAccountDTO): Promise<AccountResponseDTO> {
    const inserted = await db
      .insertInto('accounts')
      .values({
        owner_name: dto.ownerName.trim(),
        currency: dto.currency.trim().toUpperCase(),
        balance: '0',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: inserted.id,
      ownerName: inserted.owner_name,
      currency: inserted.currency,
      balance: parseInt(inserted.balance, 10),
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  }

  /**
   * Fetches account by ID. Throws NotFoundError if account does not exist.
   */
  public static async getAccountById(id: string): Promise<AccountResponseDTO> {
    const account = await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!account) {
      throw new NotFoundError(`Account with ID '${id}' was not found.`);
    }

    return {
      id: account.id,
      ownerName: account.owner_name,
      currency: account.currency,
      balance: parseInt(account.balance, 10),
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  }
}
