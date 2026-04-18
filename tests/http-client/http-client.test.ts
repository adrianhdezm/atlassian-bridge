import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { fetchJsonObject } from '../../src/http-client/http-client.js';

const TestSchema = z.object({
  id: z.string(),
  name: z.string()
});

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' }
  });
}

function textResponse(body: string, status = 200, statusText = 'OK'): Response {
  return new Response(body, {
    status,
    statusText,
    headers: { 'Content-Type': 'text/plain' }
  });
}

describe('http-client', () => {
  describe('fetchJsonObject', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('returns parsed data for a valid response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      const result = await fetchJsonObject(TestSchema, 'https://api.example.com/test', { retry: { maxRetries: 0 } });

      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('validates response against the Zod schema', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 123, name: 'Test' }));

      await expect(fetchJsonObject(TestSchema, 'https://api.example.com/test', { retry: { maxRetries: 0 } })).rejects.toThrow();
    });

    it('retries on retryable HTTP statuses', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ error: 'overloaded' }, 503, 'Service Unavailable'))
        .mockResolvedValueOnce(jsonResponse({ error: 'gateway' }, 502, 'Bad Gateway'))
        .mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      const result = await fetchJsonObject(TestSchema, 'https://api.example.com/test', {
        retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1 }
      });

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('retries on network errors (TypeError)', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      const result = await fetchJsonObject(TestSchema, 'https://api.example.com/test', {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1 }
      });

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not retry on non-retryable 4xx errors', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'not found' }, 404, 'Not Found'));

      await expect(
        fetchJsonObject(TestSchema, 'https://api.example.com/test', {
          retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1 }
        })
      ).rejects.toThrow('Request failed with status 404 | Not Found');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 Too Many Requests', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429, 'Too Many Requests'))
        .mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      const result = await fetchJsonObject(TestSchema, 'https://api.example.com/test', {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1 }
      });

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws SyntaxError for non-JSON success response (not retried)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse('not json'));

      await expect(
        fetchJsonObject(TestSchema, 'https://api.example.com/test', {
          retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1 }
        })
      ).rejects.toThrow(SyntaxError);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('uses custom retry options', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({}, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(jsonResponse({}, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(jsonResponse({}, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(jsonResponse({}, 500, 'Internal Server Error'))
        .mockResolvedValueOnce(jsonResponse({}, 500, 'Internal Server Error'))
        .mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      const result = await fetchJsonObject(TestSchema, 'https://api.example.com/test', {
        retry: { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 1 }
      });

      expect(result).toEqual({ id: '1', name: 'Test' });
      expect(fetchSpy).toHaveBeenCalledTimes(6);
    });

    it('forwards init options to fetch (excluding retry)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: '1', name: 'Test' }));

      await fetchJsonObject(TestSchema, 'https://api.example.com/test', {
        headers: { Authorization: 'Bearer token' },
        method: 'POST',
        retry: { maxRetries: 0 }
      });

      expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/test', {
        headers: { Accept: 'application/json', Authorization: 'Bearer token' },
        method: 'POST'
      });
    });

    it('logs error body on non-ok JSON response', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'forbidden' }, 403, 'Forbidden'));

      await expect(fetchJsonObject(TestSchema, 'https://api.example.com/test', { retry: { maxRetries: 0 } })).rejects.toThrow(
        'Request failed with status 403 | Forbidden'
      );

      expect(consoleSpy).toHaveBeenCalledWith({ message: 'forbidden' });
    });
  });
});
