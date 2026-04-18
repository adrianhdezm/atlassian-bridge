# Confluence SDK

Thin client for Confluence Cloud REST API v2 page operations. Lives in `src/confluence/` with Zod as the single runtime dependency. Uses `fetchJsonObject` from `src/http-client/http-client.ts` for all requests.

## Module Map

```
src/confluence/
├── confluence-models.ts    Zod schemas for API responses (deps: zod)
└── confluence-client.ts   ConfluenceClient class — auth, pages, search, space key resolution (deps: confluence-models, shared/adf-schema, shared/app-error, http-client)
```

## ConfluenceClient

```ts
interface ConfluenceClientConfig {
  baseUrl: string; // e.g. "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
}

export class ConfluenceClient {
  constructor(config: ConfluenceClientConfig);

  // Spaces
  getSpace(spaceIdOrKey: string): Promise<Space>;
  getSpaceTree(spaceIdOrKey: string, options?: GetSpaceTreeOptions): Promise<DescendantPage[]>;

  // Pages
  getPage(pageId: string): Promise<Page>;
  getPages(options?: GetPagesOptions): Promise<PaginatedPages>;
  createPage(input: CreatePageAttrs): Promise<Page>;
  updatePage(pageId: string, input: UpdatePageAttrs): Promise<Page>;
  deletePage(pageId: string): Promise<void>;

  // Descendants
  getDescendants(pageId: string, options?: GetDescendantsOptions): Promise<DescendantPage[]>;

  // Search
  searchPages(options: SearchPagesOptions): Promise<SearchResult>;
}
```

## Zod Schemas

### Page

Only the fields the CLI actually consumes. Uses `z.looseObject()` (see `000-shared.spec.md`).

```ts
const PageSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  title: z.string(),
  spaceId: z.string(),
  parentId: z.string().nullable(),
  authorId: z.string(),
  createdAt: z.string(),
  version: z.looseObject({
    number: z.number(),
    message: z.string(),
    authorId: z.string()
  }),
  body: z
    .object({
      atlas_doc_format: z
        .object({
          value: z.string(),
          representation: z.literal('atlas_doc_format')
        })
        .optional()
    })
    .optional(),
  _links: z.looseObject({ webui: z.string() })
});

type Page = z.infer<typeof PageSchema>;
```

### Paginated Response

```ts
const PaginatedPagesSchema = z.object({
  results: z.array(PageSchema),
  _links: z.object({
    next: z.string().optional()
  })
});

type PaginatedPages = z.infer<typeof PaginatedPagesSchema>;
```

### Search Result

Flattened from the v1 CQL response — each hit is `{ id, title, excerpt, url }`.

```ts
const SearchResultItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string()
});

const SearchResultSchema = z.object({
  results: z.array(SearchResultItemSchema),
  _links: z.object({
    next: z.string().optional()
  })
});

type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;
```

The `searchPages` method maps the raw v1 response into this flat shape before returning — callers never see the nested `content` wrapper.

### Space

```ts
const SpaceSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string()
});

type Space = z.infer<typeof SpaceSchema>;
```

### Descendant Page

Flat representation of a page in the descendants tree. Includes `parentId` and `depth` so callers can reconstruct the hierarchy if needed.

```ts
const DescendantPageSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  title: z.string(),
  type: z.string(),
  parentId: z.string(),
  depth: z.number(),
  childPosition: z.number()
});

type DescendantPage = z.infer<typeof DescendantPageSchema>;
```

### Paginated Descendants Response

Raw API response shape before flattening into `DescendantPage[]`.

```ts
export const PaginatedDescendantsSchema = z.object({
  results: z.array(DescendantPageSchema),
  _links: z.object({
    next: z.string().optional()
  })
});
export type PaginatedDescendants = z.infer<typeof PaginatedDescendantsSchema>;
```

## Internal State

The constructor eagerly builds auth headers (see Basic Auth in `000-shared.spec.md`) and base URL prefixes:

```ts
private readonly baseUrl: string;   // as-is from config, used to prefix `_links.next` during pagination
private readonly v2Url: string;     // `${baseUrl}/wiki/api/v2`
private readonly v1Url: string;     // `${baseUrl}/wiki/rest/api`
private readonly headers: Record<string, string>;  // pre-built auth + content-type headers
private readonly spaceKeyCache = new Map<string, string>();
```

## Space Key Resolution

Methods that accept a space identifier (`getPages`, `createPage`, `getSpaceTree`) take `spaceIdOrKey: string`. The private `resolveSpaceId` method determines whether the value is a numeric ID or an alphabetic key and resolves accordingly:

1. If `/^\d+$/` matches → return the value as-is (it's already an ID).
2. Check `spaceKeyCache` → return cached ID if present.
3. Fetch `GET /wiki/api/v2/spaces?keys=${encodeURIComponent(key)}` and parse with `SpaceLookupSchema`.
4. If `results` is empty → throw `AppError("Space not found: <key>")`.
5. Cache and return the first result's `id`.

```ts
export const SpaceLookupSchema = z.object({
  results: z.array(z.object({ id: z.string() }))
});
```

The cache is per-client-instance — no global state. Each `new ConfluenceClient()` starts with an empty cache.

## ADF Validation

`createPage` and `updatePage` validate the `body` string against `AdfSchema` (see `000-shared.spec.md`) before sending any request. Invalid ADF throws `ZodError` at the call site — no round-trip to Confluence.

The client parses the `body` string as JSON, validates against `AdfSchema`, then serializes back before wrapping in the `{ representation, value }` envelope.

## Method Input Types

```ts
interface GetPagesOptions {
  spaceIdOrKey?: string;
  title?: string;
  status?: string;
  limit?: number; // API default: 25, API max: 250 (not enforced client-side)
  cursor?: string;
}

interface CreatePageAttrs {
  spaceIdOrKey: string;
  title: string;
  parentId?: string;
  body: string; // ADF JSON string
}

interface UpdatePageAttrs {
  title: string;
  body: string; // ADF JSON string
}

interface SearchPagesOptions {
  cql: string;
  limit?: number; // API default: 25 (not enforced client-side)
  cursor?: string;
}

interface GetDescendantsOptions {
  depth?: number; // default: 5, API max: 10 (not enforced client-side)
  limit?: number; // per-page limit, default: 250, API max: 250 (not enforced client-side)
}

interface GetSpaceTreeOptions {
  depth?: number; // descendant depth below root pages, default: 2, API max: 10 (not enforced client-side)
}
```

## Implementation Details

All page methods use base path `${this.v2Url}/pages`. Body content uses `atlas_doc_format` representation exclusively.

### getSpace

`GET /wiki/api/v2/spaces/{id}`

Resolves `spaceIdOrKey` via `resolveSpaceId` (numeric pass-through or key lookup), then fetches the full space object by numeric ID.

### getPage

`GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format`

### getPages

`GET /wiki/api/v2/pages?body-format=atlas_doc_format&space-id=...&title=...`

When `spaceIdOrKey` is provided, resolves it via `resolveSpaceId` before setting the `space-id` query param.

Cursor-based pagination — single-hop. The caller drives pagination by passing the `cursor` from `_links.next` (prepended with `this.baseUrl`) back into the next call.

### createPage

`POST /wiki/api/v2/pages`

Resolves `spaceIdOrKey` via `resolveSpaceId` before building the request body. The API body field is always `spaceId` (the resolved numeric ID).

Request body sent to API:

```json
{
  "spaceId": "123456",
  "status": "current",
  "title": "Page Title",
  "parentId": "789",
  "body": {
    "representation": "atlas_doc_format",
    "value": "<ADF JSON string>"
  }
}
```

The `body` field in `CreatePageAttrs` is a serialized ADF JSON string. The method validates it against `AdfSchema`, wraps it in the `{ representation, value }` envelope, and hardcodes `status: "current"`.

### updatePage

`PUT /wiki/api/v2/pages/{id}`

Validates `body` against `AdfSchema` first, then calls `getPage(pageId)` to read `version.number`, and sends the update with `version.number + 1` and `message: "Updated via CLI"`. The caller provides only `title` and `body` — version management is fully hidden. The method injects `id` and `status: "current"` into the request body and wraps `body` in the representation envelope.

### deletePage

`DELETE /wiki/api/v2/pages/{id}`

Moves page to trash. Returns 204 (no body). Uses raw `fetch` with `this.headers`, then asserts `response.ok`.

### searchPages

`GET /wiki/rest/api/content/search?cql=...&limit=...`

The v2 API has no search endpoint — uses the **v1 CQL endpoint**. The method URL-encodes `cql`, fetches the raw v1 response, and maps each hit to `{ id, title, excerpt, url }` before validating against `SearchResultSchema`. Pagination is single-hop like `getPages` — the caller passes `cursor` from `_links.next` for subsequent pages. CQL reference: [Advanced searching using CQL](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/)

### getDescendants

`GET /wiki/api/v2/pages/{id}/descendants?depth=5&limit=250`

Returns a flat `DescendantPage[]`. Auto-paginates by following `_links.next` prepended with `this.baseUrl`. The `depth` param controls tree depth (default 5), `limit` controls per-request page size (default/max 250).

### getSpaceTree

Returns a flat `DescendantPage[]` for the full page tree of a space. Fetches root pages then descendants up to `depth` levels (default 2, max 10).

1. Resolves `spaceIdOrKey` via `resolveSpaceId` to a numeric ID.
2. Fetches root-level pages via `GET /wiki/api/v2/spaces/{spaceId}/pages?depth=root&status=current`, parsing with `PaginatedPagesSchema`. Auto-paginates via `_links.next` prepended with `this.baseUrl`.
3. If `depth <= 0`, returns roots only — skips descendant fetching.
4. Otherwise calls `getDescendants(rootId, { depth })` for each root in parallel.
5. Merges roots (converted to `DescendantPage` with `depth: 0`, `childPosition: 0`, `type: 'page'`, and `parentId` defaulting to `''` if absent) and all descendants into a flat array.

## Usage

```ts
import { ConfluenceClient } from './confluence/confluence-client.js';

const client = new ConfluenceClient({
  baseUrl: 'https://your-domain.atlassian.net',
  email: 'user@example.com',
  apiToken: 'your-api-token'
});

const page = await client.getPage('12345');
const created = await client.createPage({
  spaceIdOrKey: '67890',
  title: 'New Page',
  body: JSON.stringify({
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
  })
});
const results = await client.searchPages({ cql: 'type = page AND space = "DEV"' });
```

## Error Handling

Errors follow `fetchJsonObject` behavior (see `002-http-client.spec.md`). Additionally, `createPage` and `updatePage` throw `ZodError` if the ADF body is invalid — before any HTTP request. `deletePage` uses raw `fetch` and throws `Error` on non-ok (`response.ok === false`) responses. `resolveSpaceId` throws `AppError` when a space key returns no results.

## Testing

Tests in `tests/confluence/confluence-client.test.ts`. Uses per-test `vi.spyOn(globalThis, 'fetch')` — each test creates its own spy, no module-level `fetchMock`. Covers: constructor (auth headers, URL building), getPage, getPages, createPage (ADF validation, representation envelope), updatePage (version fetch, ADF validation), deletePage (204 assertion), searchPages (CQL encoding, v1 response flattening), getDescendants (auto-pagination, depth/limit params), getSpaceTree (root fetch + parallel descendants, depth merging), resolveSpaceId (numeric pass-through, alpha key lookup, caching, not-found error).
