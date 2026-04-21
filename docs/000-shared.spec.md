# Shared

Cross-domain models that live in `src/shared/`. No internal dependencies between modules — each is a standalone leaf.

## Module Map

```
src/shared/
├── app-error.ts       AppError class (zero deps)
├── adf-schema.ts      Hand-written Zod schema for Atlassian Document Format (deps: zod)
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

Hand-written Zod schema that validates Atlassian Document Format bodies before sending them to the API. Replaces a previous `z.fromJSONSchema()` approach that silently broke type discriminators on the vendored ADF JSON Schema.

The schema validates:

- **Document envelope**: `version: 1`, `type: "doc"`, `content` array
- **Node types**: every node must have a recognized `type` (43 known ADF node types)
- **Text nodes**: must include a `text` string field
- **Marks**: must have a recognized `type` (16 known mark types)
- **Recursive content**: nested `content` arrays validated via `z.lazy()`

Uses `z.looseObject()` throughout so extra fields (e.g. `localId`, `style`) from real Confluence/Jira content pass through without rejection.

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

All test files follow AAA structure. Mock `fetch` globally via `vi.spyOn(globalThis, 'fetch')` where needed. `AppError` is tested via `tests/cli/cli-models.test.ts` (re-exported from `cli-models.ts`). `AdfSchema` is tested directly in `tests/shared/adf-schema.test.ts` (valid and invalid ADF documents) and indirectly via the Confluence and Jira client tests. `stripKeys` and `stripPaths` are tested directly in `tests/shared/format-utils.test.ts`.
