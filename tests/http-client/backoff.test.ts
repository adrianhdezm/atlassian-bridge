import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../../src/http-client/backoff.js';

describe('backoff', () => {
  describe('retryWithBackoff', () => {
    it('returns on first success without retrying', async () => {
      const fn = vi.fn().mockResolvedValue('ok');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries and eventually succeeds', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockRejectedValueOnce(new Error('fail 2')).mockResolvedValue('ok');

      const result = await retryWithBackoff(fn, { initialDelayMs: 1, maxDelayMs: 1 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting all retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1 })).rejects.toThrow('always fails');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('applies exponential delay between retries', async () => {
      const delays: number[] = [];
      const origSetTimeout = globalThis.setTimeout;
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
        delays.push(ms ?? 0);
        return origSetTimeout(cb, 0);
      }) as typeof setTimeout);

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockRejectedValueOnce(new Error('3'))
        .mockResolvedValue('ok');

      await retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 10_000 });

      expect(delays).toEqual([100, 200, 400]);
      spy.mockRestore();
    });

    it('caps delay at maxDelayMs', async () => {
      const delays: number[] = [];
      const origSetTimeout = globalThis.setTimeout;
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
        delays.push(ms ?? 0);
        return origSetTimeout(cb, 0);
      }) as typeof setTimeout);

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('1'))
        .mockRejectedValueOnce(new Error('2'))
        .mockRejectedValueOnce(new Error('3'))
        .mockResolvedValue('ok');

      await retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 800 });

      expect(delays).toEqual([500, 800, 800]);
      spy.mockRestore();
    });

    it('stops retrying when shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 5,
          initialDelayMs: 1,
          shouldRetry: () => false
        })
      ).rejects.toThrow('non-retryable');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
