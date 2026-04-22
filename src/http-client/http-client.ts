import type { z } from 'zod';
import { retryWithBackoff } from './backoff.js';

export async function fetchAll<TPage, TItem>(options: {
  fetchPage: (cursor: string | undefined) => Promise<TPage>;
  getItems: (page: TPage) => TItem[];
  getCursor: (page: TPage) => string | undefined;
}): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await options.fetchPage(cursor);
    items.push(...options.getItems(page));
    cursor = options.getCursor(page);
  } while (cursor !== undefined);
  return items;
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`Request failed with status ${status} | ${statusText}`);
    this.status = status;
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function shouldRetry(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof HttpError && RETRYABLE_STATUSES.has(error.status)) {
    return true;
  }
  return false;
}

export async function fetchJsonObject<TData>(
  schema: z.ZodType<TData>,
  input: string | URL | Request,
  init?: RequestInit & { retry?: RetryOptions }
): Promise<TData> {
  const { retry, headers, ...restInit } = init ?? {};
  const fetchInit = { ...restInit, headers: { Accept: 'application/json', ...headers } };

  const retryOptions: Parameters<typeof retryWithBackoff>[1] = { shouldRetry };
  if (retry?.maxRetries !== undefined) {
    retryOptions.maxRetries = retry.maxRetries;
  }
  if (retry?.initialDelayMs !== undefined) {
    retryOptions.initialDelayMs = retry.initialDelayMs;
  }
  if (retry?.maxDelayMs !== undefined) {
    retryOptions.maxDelayMs = retry.maxDelayMs;
  }

  return retryWithBackoff(async () => {
    const response = await fetch(input, fetchInit);

    if (!response.ok) {
      try {
        const body: unknown = await response.json();
        console.error(body);
      } catch {
        // silently ignored if not JSON
      }
      throw new HttpError(response.status, response.statusText);
    }

    const json: unknown = await response.json();
    return schema.parse(json);
  }, retryOptions);
}

export async function fetchBinary(input: string | URL | Request, init?: RequestInit & { retry?: RetryOptions }): Promise<ArrayBuffer> {
  const { retry, ...restInit } = init ?? {};

  const retryOptions: Parameters<typeof retryWithBackoff>[1] = { shouldRetry };
  if (retry?.maxRetries !== undefined) {
    retryOptions.maxRetries = retry.maxRetries;
  }
  if (retry?.initialDelayMs !== undefined) {
    retryOptions.initialDelayMs = retry.initialDelayMs;
  }
  if (retry?.maxDelayMs !== undefined) {
    retryOptions.maxDelayMs = retry.maxDelayMs;
  }

  return retryWithBackoff(async () => {
    const response = await fetch(input, restInit);

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }

    return response.arrayBuffer();
  }, retryOptions);
}
