# Shared

Cross-domain models that live in `src/shared/`. No internal dependencies between modules — each is a standalone leaf.

## Module Map

```
src/shared/
├── app-error.ts       AppError class (zero deps)
├── adf-schema.ts      Zod schema for Atlassian Document Format (deps: zod, adf-schema.json)
├── adf-schema.json    ADF JSON Schema source
└── format-utils.ts    Recursive key/path-stripping utilities for output formatting (zero deps)
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

## Format Utils

Two complementary utilities for cleaning API objects before CLI output. Used by the domain-specific format modules (`jira-format.ts`, `confluence-format.ts`).

### stripKeys

Generic recursive utility that removes a set of keys from an object tree.

```ts
export function stripKeys(value: unknown, keys: ReadonlySet<string>): unknown;
```

Recursively walks objects and arrays, omitting any key present in `keys`. Preserves primitives, `null`, and `undefined` unchanged. Each domain defines its own `STRIPPED_KEYS` set and a typed wrapper (e.g. `formatIssue`, `formatPage`).

### stripPaths

Removes values at specific dot-separated paths from an object.

```ts
export function stripPaths(value: unknown, paths: ReadonlyArray<string>): unknown;
```

Deep-clones the input, then walks each dot-separated path (e.g. `'fields.issuetype.description'`) and deletes the final key. When a segment resolves to an array, the remaining path is applied to every element (e.g. `'fields.components.description'` strips `description` from all items in the `components` array). Silently ignores paths that don't exist or where an intermediate segment is not an object. Preserves primitives, `null`, and `undefined` unchanged. Complements `stripKeys` — use `stripKeys` for global key removal and `stripPaths` for targeted path removal.

## Conventions

### Loose Zod Schemas

Zod schemas for Atlassian **resource/entity** objects (e.g. `PageSchema`, `IssueSchema`, `SpaceSchema`, `SearchResultItemSchema`) use `z.looseObject()` instead of `z.object()`. This tolerates extra fields the API returns without causing validation errors — only the fields the CLI consumes are declared. **Envelope/pagination** wrappers (e.g. `PaginatedPagesSchema`, `SearchResultSchema`, `IssueSearchResultSchema`) use strict `z.object()` since their structure is fixed.

### Basic Auth

Both SDK clients authenticate with [Atlassian Basic auth](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/) — email + API token, Base64-encoded:

```ts
Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`;
```

Credentials are resolved by `CredentialStorage` (see `005-credential-storage.spec.md`).

### Testing

All test files follow AAA structure. Mock `fetch` globally via `vi.spyOn(globalThis, 'fetch')` where needed. `AppError` is tested via `tests/cli/cli-models.test.ts` (re-exported from `cli-models.ts`), `AdfSchema` is tested indirectly via the Confluence and Jira client tests. `stripKeys` and `stripPaths` are tested directly in `tests/shared/format-utils.test.ts`.
