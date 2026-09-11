import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('Step 4: Health & Account Endpoints', () => {
  describe('GET /health', () => {
    it('returns 200 OK with database health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        db: 'healthy',
      });
    });
  });

  describe('POST /accounts & GET /accounts/:id', () => {
    let createdAccountId: string;

    it('successfully creates a new account with 0 balance', async () => {
      const res = await request(app).post('/accounts').send({
        ownerName: 'Asha Patel',
        currency: 'INR',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.ownerName).toBe('Asha Patel');
      expect(res.body.currency).toBe('INR');
      expect(res.body.balance).toBe(0);

      createdAccountId = res.body.id;
    });

    it('rejects invalid currency code length', async () => {
      const res = await request(app).post('/accounts').send({
        ownerName: 'Asha Patel',
        currency: 'RUPEES',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('rejects empty ownerName', async () => {
      const res = await request(app).post('/accounts').send({
        ownerName: '',
        currency: 'INR',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('fetches existing account details by ID', async () => {
      const res = await request(app).get(`/accounts/${createdAccountId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdAccountId);
      expect(res.body.ownerName).toBe('Asha Patel');
      expect(res.body.currency).toBe('INR');
      expect(res.body.balance).toBe(0);
    });

    it('returns 404 for a non-existent account UUID', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/accounts/${randomUuid}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for an invalid UUID format', async () => {
      const res = await request(app).get('/accounts/invalid-uuid-123');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });
});
