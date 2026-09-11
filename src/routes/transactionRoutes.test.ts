import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Step 6: Paginated Transaction History API (GET /accounts/:id/transactions)', () => {
  let accountId: string;
  let counterpartyId: string;

  const runId = Date.now();

  it('sets up test accounts and transactions', async () => {
    // 1. Create primary account
    const res1 = await request(app).post('/accounts').send({
      ownerName: 'Transaction Test Owner',
      currency: 'INR',
    });
    expect(res1.status).toBe(201);
    accountId = res1.body.id;

    // 2. Create counterparty account
    const res2 = await request(app).post('/accounts').send({
      ownerName: 'Counterparty Owner',
      currency: 'INR',
    });
    expect(res2.status).toBe(201);
    counterpartyId = res2.body.id;

    // 3. Perform Credit #1
    await request(app)
      .post(`/accounts/${accountId}/credit`)
      .set('Idempotency-Key', `tx-hist-credit-${runId}`)
      .send({ amount: 100000, reference: 'initial-deposit' });

    // 4. Perform Debit #1
    await request(app)
      .post(`/accounts/${accountId}/debit`)
      .set('Idempotency-Key', `tx-hist-debit-${runId}`)
      .send({ amount: 25000, reference: 'atm-withdrawal' });

    // 5. Perform Transfer #1 to counterparty
    await request(app)
      .post('/transfers')
      .set('Idempotency-Key', `tx-hist-transfer-${runId}`)
      .send({
        fromAccountId: accountId,
        toAccountId: counterpartyId,
        amount: 15000,
        reference: 'rent-share',
      });
  });

  it('returns paginated transactions ordered newest first', async () => {
    const res = await request(app).get(`/accounts/${accountId}/transactions`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      totalCount: 3,
      totalPages: 1,
    });

    // Verify newest transaction first (Transfer DEBIT)
    const [tx1, tx2, tx3] = res.body.data;

    expect(tx1.type).toBe('DEBIT');
    expect(tx1.amount).toBe(15000);
    expect(tx1.reference).toBe('rent-share');
    expect(tx1.counterpartyAccountId).toBe(counterpartyId);
    expect(tx1.balanceAfter).toBe(60000);

    // Second newest (Debit)
    expect(tx2.type).toBe('DEBIT');
    expect(tx2.amount).toBe(25000);
    expect(tx2.reference).toBe('atm-withdrawal');
    expect(tx2.counterpartyAccountId).toBeNull();
    expect(tx2.balanceAfter).toBe(75000);

    // Oldest (Credit)
    expect(tx3.type).toBe('CREDIT');
    expect(tx3.amount).toBe(100000);
    expect(tx3.reference).toBe('initial-deposit');
    expect(tx3.counterpartyAccountId).toBeNull();
    expect(tx3.balanceAfter).toBe(100000);
  });

  it('supports custom pagination limits and pages', async () => {
    // Page 1 with limit 2
    const resPage1 = await request(app).get(`/accounts/${accountId}/transactions?page=1&limit=2`);
    expect(resPage1.status).toBe(200);
    expect(resPage1.body.data).toHaveLength(2);
    expect(resPage1.body.pagination).toEqual({
      page: 1,
      limit: 2,
      totalCount: 3,
      totalPages: 2,
    });

    // Page 2 with limit 2
    const resPage2 = await request(app).get(`/accounts/${accountId}/transactions?page=2&limit=2`);
    expect(resPage2.status).toBe(200);
    expect(resPage2.body.data).toHaveLength(1);
    expect(resPage2.body.data[0].reference).toBe('initial-deposit');
  });

  it('returns 404 for non-existent account ID', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/accounts/${randomUuid}/transactions`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
