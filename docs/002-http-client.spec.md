# HTTP Client

Thin fetch wrapper with Zod response validation. Lives in `src/http-client/` with Zod as the single runtime dependency.

## Module Map

```
src/http-client/
├── http-client.ts    fetchJsonObject — typed fetch + Zod parse + retry (deps: zod, backoff)
└── backoff.ts        retryWithBackoff — generic async retry with exponential backoff (zero deps)
```

## API Surface

### fetchJsonObject

```ts
import type { z } from 'zod';

export interface RetryOptions {
  maxRetries?: number; // default: 3
  initialDelayMs?: number; // default: 500
  maxDelayMs?: number; // default: 10000
}

export async function fetchJsonObject<TData>(
  schema: z.ZodType<TData>,
  input: string | URL | Request,
  init?: RequestInit & { retry?: RetryOptions }
): Promise<TData>;
```

Accepts a Zod schema, standard `fetch` parameters (`input`, `init?`), and an optional `retry` config merged into `init`. Both `retry` and `headers` are destructured from `init` before forwarding to `fetch`. A new headers object is built as `{ Accept: 'application/json', ...headers }` — caller-provided headers override the default `Accept`. Returns the parsed and validated response body typed as `TData`.

### retryWithBackoff

```ts
export interface RetryWithBackoffOptions {
  maxRetries?: number; // default: 3
  initialDelayMs?: number; // default: 500
  maxDelayMs?: number; // default: 10000
  shouldRetry?: (error: unknown) => boolean; // default: () => true
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options?: RetryWithBackoffOptions): Promise<T>;
```

Generic retry utility. Calls `fn`, catches errors, and retries with exponential backoff if `shouldRetry` returns `true`. `http-client.ts` uses this internally with a `shouldRetry` that checks for retryable HTTP statuses and network errors.

### Usage

```ts
import { z } from 'zod';
import { fetchJsonObject } from './http-client/http-client.js';

const IssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string()
});

const issue = await fetchJsonObject(IssueSchema, 'https://api.example.com/issue/ABC-123', {
  headers: { Authorization: 'Bearer <token>' }
});
// issue is typed as { id: string; key: string; summary: string }

// With retry configuration
const data = await fetchJsonObject(IssueSchema, 'https://api.example.com/issue/ABC-123', {
  headers: { Authorization: 'Bearer <token>' },
  retry: { maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 15000 }
});
```

## Response Lifecycle

```
fetch(input, init)  // retry stripped from init before forwarding
 │
 ├─ network error (TypeError) → retry loop
 │
 ├─ response.ok === false
 │    ├─ retryable status (429, 500, 502, 503, 504) → retry loop
 │    ├─ attempt to parse response body as JSON (for diagnostics, silently ignored if not JSON)
 │    ├─ log error object via console.error (only if body parsed)
 │    └─ throw HttpError: "Request failed with status <status> | <statusText>" (has .status property)
 │
 ├─ response.ok === true
 │    ├─ parse response body as JSON
 │    │    └─ SyntaxError (non-JSON body) → propagates (not retried)
 │    ├─ schema.parse(json)
 │    │    ├─ valid → return typed TData
 │    │    └─ invalid → throw ZodError (not retried)
 │    └─ done

retry loop (attempt = 0 … maxRetries):
  call fn()
  on error: attempt >= maxRetries or !shouldRetry → throw error
  delay = min(initialDelayMs * 2^attempt, maxDelayMs) → wait → attempt++
```

Retryable conditions:

- **Network errors** — `TypeError` thrown by `fetch` (DNS failure, connection refused, etc.)
- **HTTP status codes** — `429`, `500`, `502`, `503`, `504`

Non-retryable failures (thrown immediately):

- **Client errors** — `4xx` other than `429`
- **Schema validation** — `ZodError` from `schema.parse()`
- **Non-JSON response** — `SyntaxError` from `response.json()` on a successful response

`HttpError` is an internal `Error` subclass with a `.status: number` property. It is not exported but can be distinguished via the status field.

## Contracts & Invariants

### Retry Defaults

| Option           | Default | Description                                                |
| ---------------- | ------- | ---------------------------------------------------------- |
| `maxRetries`     | `3`     | Maximum number of retry attempts after the initial request |
| `initialDelayMs` | `500`   | Delay before the first retry                               |
| `maxDelayMs`     | `10000` | Upper bound on delay — exponential growth stops here       |

Pass `{ maxRetries: 0 }` to disable retries entirely.

### Fetch Passthrough

All `fetch` parameters are forwarded unmodified except `retry`, which is destructured out of `init` before the call. The only header added by the wrapper is `Accept: application/json` — no timeouts or other behaviors are layered on beyond retry.

### Generic Typing

The return type `Promise<TData>` is inferred from the Zod schema passed as the first argument. No manual type annotation needed at the call site.

## Testing

Tests in `tests/http-client/`:

| File                  | Covers                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `http-client.test.ts` | Zod validation, retry on retryable statuses/network errors, non-retryable 4xx, custom retry options, SyntaxError on non-JSON |
| `backoff.test.ts`     | First-success pass-through, eventual success, retry exhaustion, exponential delay, maxDelayMs cap, shouldRetry short-circuit |
