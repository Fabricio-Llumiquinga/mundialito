import { describe, it, expect, afterEach } from 'vitest';
import {
  calculateBackoffDelay,
  getDefaultClient,
  resetDefaultClient,
  getTableName,
} from './client';

describe('DynamoDB Client Utilities', () => {
  afterEach(() => {
    resetDefaultClient();
  });

  describe('calculateBackoffDelay', () => {
    it('returns a value between 0 and baseDelay for attempt 0', () => {
      const delay = calculateBackoffDelay(0, 100, 5000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(100);
    });

    it('returns a value between 0 and baseDelay*2 for attempt 1', () => {
      const delay = calculateBackoffDelay(1, 100, 5000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(200);
    });

    it('returns a value between 0 and baseDelay*4 for attempt 2', () => {
      const delay = calculateBackoffDelay(2, 100, 5000);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(400);
    });

    it('caps delay at maxDelay', () => {
      const delay = calculateBackoffDelay(20, 100, 500);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(500);
    });

    it('uses default values when not specified', () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(100); // default baseDelay is 100
    });
  });

  describe('getDefaultClient', () => {
    it('returns a DynamoDB Document client', () => {
      const client = getDefaultClient();
      expect(client).toBeDefined();
      expect(client.send).toBeDefined();
    });

    it('returns the same instance on subsequent calls (singleton)', () => {
      const client1 = getDefaultClient();
      const client2 = getDefaultClient();
      expect(client1).toBe(client2);
    });

    it('returns a new instance after reset', () => {
      const client1 = getDefaultClient();
      resetDefaultClient();
      const client2 = getDefaultClient();
      expect(client1).not.toBe(client2);
    });
  });

  describe('getTableName', () => {
    it('returns the configured table name', () => {
      const name = getTableName();
      expect(name).toBe('MundialPredictions');
    });
  });
});
