# Shared

Cross-domain models that live in `src/shared/`. No internal dependencies between modules — each is a standalone leaf.

## Module Map

```
src/shared/
├── app-error.ts       AppError class (zero deps)
├── adf-schema.ts      Zod schema for Atlassian Document Format (deps: zod, adf-schema.json)
└── adf-schema.json    ADF JSON Schema source
```

## AppError

Single error class used across all domains for recoverable, user-facing errors.

```ts
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}
```

## AdfSchema

Zod schema derived from the vendored [ADF JSON Schema v1](https://unpkg.com/@atlaskit/adf-schema@52.5.0/dist/json-schema/v1/full.json) via `z.fromJSONSchema()`. Validates Atlassian Document Format bodies before sending them to the API.

```ts
import adfJsonSchema from './adf-schema.json' with { type: 'json' };
import type { JSONSchema } from 'zod/v4/core';
import { z } from 'zod';

export const AdfSchema = z.fromJSONSchema(adfJsonSchema as JSONSchema.JSONSchema);
```

The `as JSONSchema.JSONSchema` cast is required because `resolveJsonModule` widens string literals (e.g. `$schema`) to `string`, which doesn't satisfy Zod's literal union. `satisfies` cannot be used here.

## Conventions

### Loose Zod Schemas

All Zod schemas for Atlassian API responses (in `src/confluence/` and `src/jira/`) use `z.looseObject()` instead of `z.object()`. This tolerates extra fields the API returns without causing validation errors — only the fields the CLI consumes are declared.

### Basic Auth

Both SDK clients authenticate with [Atlassian Basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/) — email + API token, Base64-encoded:

```ts
Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`;
```

Credentials are resolved by `CredentialStorage` (see `005-credential-storage.spec.md`).

### Testing

All test files follow AAA structure. Mock `fetch` globally via `vi.spyOn(globalThis, 'fetch')` where needed. No dedicated tests for `src/shared/` — `AppError` is tested via `tests/cli/cli-models.test.ts` (re-exported from `cli-models.ts`), `AdfSchema` is tested indirectly via the Confluence and Jira client tests.
