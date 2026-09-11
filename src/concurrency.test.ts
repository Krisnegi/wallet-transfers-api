import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

describe('Step 7: Heavy Concurrency & Race Condition Verification', () => {
  const runId = Date.now();

  describe('1. Concurrent Debit Race Condition (Negative-Balance Rule Under Load)', () => {
    it('prevents overdrawing when 20 parallel debits race for the same balance', async () => {
      // 1. Create account with 10000 balance (₹100.00)
      const accRes = await request(app).post('/accounts').send({
        ownerName: 'Concurrency Test Owner',
        currency: 'INR',
      });
      expect(accRes.status).toBe(201);
      const accountId = accRes.body.id;

      await request(app)
        .post(`/accounts/${accountId}/credit`)
        .set('Idempotency-Key', `conc-init-credit-${runId}`)
        .send({ amount: 10000, reference: 'initial-funding' });

      // 2. Fire 20 parallel debit requests simultaneously, each requesting 10000
      const parallelRequests = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post(`/accounts/${accountId}/debit`)
          .set('Idempotency-Key', `conc-debit-key-${runId}-${i}`)
          .send({ amount: 10000, reference: `race-debit-${i}` })
      );

      const results = await Promise.all(parallelRequests);

      const successResponses = results.filter((r) => r.status === 200);
      const insufficientFundsResponses = results.filter(
        (r) => r.status === 400 && r.body.error?.code === 'INSUFFICIENT_FUNDS'
      );

      // 3. Verify exactly 1 succeeded and 19 failed cleanly with INSUFFICIENT_FUNDS
      expect(successResponses).toHaveLength(1);
      expect(insufficientFundsResponses).toHaveLength(19);

      // 4. Verify account balance in database never went negative (is exactly 0)
      const finalAcc = await request(app).get(`/accounts/${accountId}`);
      expect(finalAcc.body.balance).toBe(0);
    });

    it('allows exactly 5 out of 20 parallel debits of Rs 20 against Rs 100 balance', async () => {
      // 1. Create account with 10000 minor units balance (₹100.00)
      const accRes = await request(app).post('/accounts').send({
        ownerName: 'Partial Debit Test Owner',
        currency: 'INR',
      });
      const accountId = accRes.body.id;

      await request(app)
        .post(`/accounts/${accountId}/credit`)
        .set('Idempotency-Key', `partial-init-credit-${runId}`)
        .send({ amount: 10000, reference: 'initial-100-rupees' });

      // 2. Fire 20 parallel debit requests simultaneously, each requesting 2000 (₹20.00)
      const parallelRequests = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post(`/accounts/${accountId}/debit`)
          .set('Idempotency-Key', `partial-debit-key-${runId}-${i}`)
          .send({ amount: 2000, reference: `debit-20-rupees-${i}` })
      );

      const results = await Promise.all(parallelRequests);

      const successResponses = results.filter((r) => r.status === 200);
      const insufficientFundsResponses = results.filter(
        (r) => r.status === 400 && r.body.error?.code === 'INSUFFICIENT_FUNDS'
      );

      // 3. Verify exactly 5 succeeded (5 * 2000 = 10000) and 15 failed
      expect(successResponses).toHaveLength(5);
      expect(insufficientFundsResponses).toHaveLength(15);

      // 4. Verify account balance in database is exactly 0
      const finalAcc = await request(app).get(`/accounts/${accountId}`);
      expect(finalAcc.body.balance).toBe(0);
    });
  });

  describe('2. Concurrent Reverse Transfers (Deadlock Prevention & Conservation of Money)', () => {
    it('handles 20 racing cross-transfers between A->B and B->A with zero deadlocks', async () => {
      // 1. Create Account A (50000) and Account B (50000) -> Total = 100000
      const accA = await request(app).post('/accounts').send({ ownerName: 'Alice', currency: 'INR' });
      const accB = await request(app).post('/accounts').send({ ownerName: 'Bob', currency: 'INR' });

      const accountAId = accA.body.id;
      const accountBId = accB.body.id;

      await request(app)
        .post(`/accounts/${accountAId}/credit`)
        .set('Idempotency-Key', `conc-a-credit-${runId}`)
        .send({ amount: 50000, reference: 'funding-a' });

      await request(app)
        .post(`/accounts/${accountBId}/credit`)
        .set('Idempotency-Key', `conc-b-credit-${runId}`)
        .send({ amount: 50000, reference: 'funding-b' });

      // 2. Prepare 20 racing transfers: 10 from A->B, 10 from B->A
      const transfers = [];
      for (let i = 0; i < 10; i++) {
        transfers.push(
          request(app)
            .post('/transfers')
            .set('Idempotency-Key', `conc-ab-${runId}-${i}`)
            .send({
              fromAccountId: accountAId,
              toAccountId: accountBId,
              amount: 2000,
              reference: `transfer-a-to-b-${i}`,
            })
        );
        transfers.push(
          request(app)
            .post('/transfers')
            .set('Idempotency-Key', `conc-ba-${runId}-${i}`)
            .send({
              fromAccountId: accountBId,
              toAccountId: accountAId,
              amount: 2000,
              reference: `transfer-b-to-a-${i}`,
            })
        );
      }

      // Fire all 20 transfers concurrently
      const results = await Promise.all(transfers);

      // Verify ZERO requests failed with deadlocks or 500 internal server errors
      const failedRequests = results.filter((r) => r.status !== 200);
      expect(failedRequests).toHaveLength(0);

      // Verify total money in system is conserved (Sum of A + B balance === 100000)
      const resA = await request(app).get(`/accounts/${accountAId}`);
      const resB = await request(app).get(`/accounts/${accountBId}`);

      const totalBalance = resA.body.balance + resB.body.balance;
      expect(totalBalance).toBe(100000);
    });
  });

  describe('3. Concurrent Idempotency Replay (Thundering Herd)', () => {
    it('executes money movement exactly once when 10 identical requests race with same key', async () => {
      // 1. Create account with 20000 balance
      const accRes = await request(app).post('/accounts').send({
        ownerName: 'Thundering Herd Owner',
        currency: 'INR',
      });
      const accountId = accRes.body.id;

      await request(app)
        .post(`/accounts/${accountId}/credit`)
        .set('Idempotency-Key', `thundering-init-${runId}`)
        .send({ amount: 20000, reference: 'init' });

      // 2. Fire 10 parallel requests with the EXACT SAME Idempotency-Key
      const sameKey = `thundering-herd-key-${runId}`;
      const parallelReplays = Array.from({ length: 10 }, () =>
        request(app)
          .post(`/accounts/${accountId}/debit`)
          .set('Idempotency-Key', sameKey)
          .send({ amount: 5000, reference: 'single-debit' })
      );

      const results = await Promise.all(parallelReplays);

      // Verify ALL 10 responses return 200 OK
      const successCount = results.filter((r) => r.status === 200).length;
      expect(successCount).toBe(10);

      // Verify ALL 10 responses return identical transaction ID
      const txId = results[0]!.body.transactionId;
      results.forEach((r) => {
        expect(r.body.transactionId).toBe(txId);
        expect(r.body.balanceAfter).toBe(15000);
      });

      // Verify account balance dropped by 5000 ONLY ONCE (from 20000 to 15000)
      const finalAcc = await request(app).get(`/accounts/${accountId}`);
      expect(finalAcc.body.balance).toBe(15000);
    });
  });
});
