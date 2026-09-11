import { describe, it, expect } from 'vitest';
import { commonSchemas } from './validate.js';
import { IdempotencyService } from '../services/idempotencyService.js';

describe('Step 3: Validation Schemas & Idempotency Services', () => {
  describe('Amount validation schema', () => {
    it('accepts positive minor unit integers', () => {
      expect(commonSchemas.amountInMinorUnits.parse(50000)).toBe(50000);
      expect(commonSchemas.amountInMinorUnits.parse(1)).toBe(1);
    });

    it('rejects zero amount', () => {
      expect(() => commonSchemas.amountInMinorUnits.parse(0)).toThrow();
    });

    it('rejects negative amount', () => {
      expect(() => commonSchemas.amountInMinorUnits.parse(-100)).toThrow();
    });

    it('rejects decimal / float values', () => {
      expect(() => commonSchemas.amountInMinorUnits.parse(500.5)).toThrow();
    });
  });

  describe('Currency validation schema', () => {
    it('normalizes valid 3-letter currency to uppercase', () => {
      expect(commonSchemas.currency.parse('inr')).toBe('INR');
      expect(commonSchemas.currency.parse('USD')).toBe('USD');
    });

    it('rejects invalid currency lengths', () => {
      expect(() => commonSchemas.currency.parse('US')).toThrow();
      expect(() => commonSchemas.currency.parse('USDT')).toThrow();
    });
  });

  describe('Idempotency Service SHA-256 hash', () => {
    it('generates consistent hashes for identical payloads', () => {
      const hash1 = IdempotencyService.generateRequestHash('/transfers', { amount: 500 });
      const hash2 = IdempotencyService.generateRequestHash('/transfers', { amount: 500 });
      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different payloads', () => {
      const hash1 = IdempotencyService.generateRequestHash('/transfers', { amount: 500 });
      const hash2 = IdempotencyService.generateRequestHash('/transfers', { amount: 600 });
      expect(hash1).not.toBe(hash2);
    });
  });
});
