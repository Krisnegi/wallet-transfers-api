import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Step 5: Money Movement APIs (Credit, Debit & Transfers)', () => {
  let accountAId: string;
  let accountBId: string;
  let usdAccountId: string;

  const runId = Date.now();
  const keyCredit = `credit-key-${runId}`;
  const keyDebit = `debit-key-${runId}`;
  const keyTransfer = `transfer-key-${runId}`;

  it('sets up accounts for testing', async () => {
    // Create Account A (INR)
    const resA = await request(app).post('/accounts').send({
      ownerName: 'Alice',
      currency: 'INR',
    });
    expect(resA.status).toBe(201);
    accountAId = resA.body.id;

    // Create Account B (INR)
    const resB = await request(app).post('/accounts').send({
      ownerName: 'Bob',
      currency: 'INR',
    });
    expect(resB.status).toBe(201);
    accountBId = resB.body.id;

    // Create USD Account
    const resUsd = await request(app).post('/accounts').send({
      ownerName: 'Charlie',
      currency: 'USD',
    });
    expect(resUsd.status).toBe(201);
    usdAccountId = resUsd.body.id;
  });

  describe('POST /accounts/:id/credit', () => {
    it('requires Idempotency-Key header', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/credit`)
        .send({ amount: 50000, reference: 'salary-aug' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('credits account and updates balance from 0 to 50000', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/credit`)
        .set('Idempotency-Key', keyCredit)
        .send({ amount: 50000, reference: 'salary-aug' });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(50000);
      expect(res.body.balanceAfter).toBe(50000);
      expect(res.body.type).toBe('CREDIT');
    });

    it('replays identical response when exact same idempotency key is sent again', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/credit`)
        .set('Idempotency-Key', keyCredit)
        .send({ amount: 50000, reference: 'salary-aug' });

      expect(res.status).toBe(200);
      expect(res.body.balanceAfter).toBe(50000); // Balance did NOT increase to 100000!

      // Verify account balance in database remains 50000
      const accRes = await request(app).get(`/accounts/${accountAId}`);
      expect(accRes.body.balance).toBe(50000);
    });

    it('returns 409 Conflict when idempotency key is reused with a different body', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/credit`)
        .set('Idempotency-Key', keyCredit)
        .send({ amount: 99999, reference: 'different-body' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('POST /accounts/:id/debit', () => {
    it('debits account balance from 50000 to 20000', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/debit`)
        .set('Idempotency-Key', keyDebit)
        .send({ amount: 30000, reference: 'rent' });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(30000);
      expect(res.body.balanceAfter).toBe(20000);
    });

    it('rejects debit request when amount exceeds current balance', async () => {
      const res = await request(app)
        .post(`/accounts/${accountAId}/debit`)
        .set('Idempotency-Key', `overdraw-key-${runId}`)
        .send({ amount: 50000, reference: 'excess-debit' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('POST /transfers', () => {
    it('transfers 10000 from Account A (20000 -> 10000) to Account B (0 -> 10000)', async () => {
      const res = await request(app)
        .post('/transfers')
        .set('Idempotency-Key', keyTransfer)
        .send({
          fromAccountId: accountAId,
          toAccountId: accountBId,
          amount: 10000,
          reference: 'settlement-9912',
        });

      expect(res.status).toBe(200);
      expect(res.body.fromBalanceAfter).toBe(10000);
      expect(res.body.toBalanceAfter).toBe(10000);

      // Verify balances via GET /accounts/:id
      const resA = await request(app).get(`/accounts/${accountAId}`);
      expect(resA.body.balance).toBe(10000);

      const resB = await request(app).get(`/accounts/${accountBId}`);
      expect(resB.body.balance).toBe(10000);
    });

    it('rejects transfer between accounts with different currencies', async () => {
      const res = await request(app)
        .post('/transfers')
        .set('Idempotency-Key', `currency-mismatch-key-${runId}`)
        .send({
          fromAccountId: accountAId,
          toAccountId: usdAccountId,
          amount: 1000,
          reference: 'cross-border',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CURRENCY_MISMATCH');
    });

    it('rejects transfer to self (same fromAccountId and toAccountId)', async () => {
      const res = await request(app)
        .post('/transfers')
        .set('Idempotency-Key', `self-transfer-key-${runId}`)
        .send({
          fromAccountId: accountAId,
          toAccountId: accountAId,
          amount: 1000,
          reference: 'self-transfer',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });
});
