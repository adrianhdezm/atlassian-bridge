import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { fetchAll, fetchJsonObject } from '../../src/http-client/http-client.js';

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
  describe('fetchAll', () => {
    it('collects items from a single page', async () => {
      const page: { items: number[]; next: string | undefined } = { items: [1, 2, 3], next: undefined };

      const result = await fetchAll({
        fetchPage: () => Promise.resolve(page),
        getItems: (p) => p.items,
        getCursor: (p) => p.next
      });

      expect(result).toEqual([1, 2, 3]);
    });

    it('follows cursors across multiple pages', async () => {
      type Page = { items: string[]; next: string | undefined };
      const pageMap = new Map<string | undefined, Page>([
        [undefined, { items: ['a', 'b'], next: 'cursor1' }],
        ['cursor1', { items: ['c'], next: 'cursor2' }],
        ['cursor2', { items: ['d', 'e'], next: undefined }]
      ]);

      const result = await fetchAll({
        fetchPage: (cursor) => Promise.resolve(pageMap.get(cursor) as Page),
        getItems: (page) => page.items,
        getCursor: (page) => page.next
      });

      expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('returns empty array when first page has no items', async () => {
      const page: { items: number[]; next: string | undefined } = { items: [], next: undefined };

      const result = await fetchAll({
        fetchPage: () => Promise.resolve(page),
        getItems: (p) => p.items,
        getCursor: (p) => p.next
      });

      expect(result).toEqual([]);
    });

    it('passes cursor from previous page to fetchPage', async () => {
      const cursors: (string | undefined)[] = [];
      const first: { items: number[]; next: string | undefined } = { items: [1], next: 'abc' };
      const last: { items: number[]; next: string | undefined } = { items: [2], next: undefined };

      await fetchAll({
        fetchPage: (cursor) => {
          cursors.push(cursor);
          if (cursor === undefined) {
            return Promise.resolve(first);
          }
          return Promise.resolve(last);
        },
        getItems: (page) => page.items,
        getCursor: (page) => page.next
      });

      expect(cursors).toEqual([undefined, 'abc']);
    });
  });

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
