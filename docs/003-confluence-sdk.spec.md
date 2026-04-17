# Confluence SDK

Thin client for Confluence Cloud REST API v2 page operations. Lives in `src/confluence/` with Zod as the single runtime dependency. Uses `fetchJsonObject` from `src/http-client/http-client.ts` for all requests.

## Module Map

```
src/confluence/
├── confluence-models.ts    Zod schemas for API responses (deps: zod)
└── confluence-client.ts   ConfluenceClient class — auth, pages, search (deps: confluence-models, shared/adf-schema, http-client)
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

  // Pages
  getPage(pageId: string): Promise<Page>;
  getPages(options?: GetPagesOptions): Promise<PaginatedPages>;
  createPage(input: CreatePageAttrs): Promise<Page>;
  updatePage(pageId: string, input: UpdatePageAttrs): Promise<Page>;
  deletePage(pageId: string): Promise<void>;

  // Descendants
  getDescendants(pageId: string, options?: GetDescendantsOptions): Promise<DescendantPage[]>;
  getSpaceTree(spaceId: string, options?: GetSpaceTreeOptions): Promise<DescendantPage[]>;

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
    next: z.string().optional(),
    base: z.string()
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
    next: z.string().optional(),
    base: z.string()
  })
});

type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;
```

The `searchPages` method maps the raw v1 response into this flat shape before returning — callers never see the nested `content` wrapper.

### Descendant Page

Flat representation of a page in the descendants tree. Includes `parentId` and `depth` so callers can reconstruct the hierarchy if needed.

```ts
const DescendantPageSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  title: z.string(),
  spaceId: z.string(),
  parentId: z.string().nullable(),
  depth: z.number(),
  _links: z.looseObject({ webui: z.string() })
});

type DescendantPage = z.infer<typeof DescendantPageSchema>;
```

### Paginated Descendants Response

Raw API response shape before flattening into `DescendantPage[]`.

```ts
const PaginatedDescendantsSchema = z.object({
  results: z.array(DescendantPageSchema),
  _links: z.object({
    next: z.string().optional(),
    base: z.string()
  })
});
```

## Internal State

The constructor eagerly builds auth headers (see Basic Auth in `000-shared.spec.md`) and base URL prefixes:

```ts
private readonly v2Url: string;  // `${baseUrl}/wiki/api/v2`
private readonly v1Url: string;  // `${baseUrl}/wiki/rest/api`
```

## ADF Validation

`createPage` and `updatePage` validate the `body` string against `AdfSchema` (see `000-shared.spec.md`) before sending any request. Invalid ADF throws `ZodError` at the call site — no round-trip to Confluence.

The client parses the `body` string as JSON, validates against `AdfSchema`, then serializes back before wrapping in the `{ representation, value }` envelope.

## Method Input Types

```ts
interface GetPagesOptions {
  spaceId?: string;
  title?: string;
  status?: string;
  limit?: number; // API default: 25, API max: 250 (not enforced client-side)
  cursor?: string;
}

interface CreatePageAttrs {
  spaceId: string;
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
  depth?: number; // default: 3, API max: 10 (not enforced client-side)
}
```

## Implementation Details

All page methods use base path `${this.v2Url}/pages`. Body content uses `atlas_doc_format` representation exclusively.

### getPage

`GET /wiki/api/v2/pages/{id}?body-format=atlas_doc_format`

### getPages

`GET /wiki/api/v2/pages?body-format=atlas_doc_format&space-id=...&title=...`

Cursor-based pagination — follow `_links.next` for subsequent pages.

### createPage

`POST /wiki/api/v2/pages`

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

Internally calls `getPage(pageId)` first to read `version.number`, validates `body` against `AdfSchema`, then sends the update with `version.number + 1` and `message: "Updated via CLI"`. The caller provides only `title` and `body` — version management is fully hidden. The method injects `id` and `status: "current"` into the request body and wraps `body` in the representation envelope.

### deletePage

`DELETE /wiki/api/v2/pages/{id}`

Moves page to trash. Returns 204 (no body). Uses raw `fetch` with `this.headers`, then asserts `response.ok`.

### searchPages

`GET /wiki/rest/api/content/search?cql=...&limit=...`

The v2 API has no search endpoint — uses the **v1 CQL endpoint**. The method URL-encodes `cql`, fetches the raw v1 response, and maps each hit to `{ id, title, excerpt, url }` before validating against `SearchResultSchema`. CQL reference: [Advanced searching using CQL](https://developer.atlassian.com/cloud/confluence/advanced-searching-using-cql/)

### getDescendants

`GET /wiki/api/v2/pages/{id}/descendants?depth=5&limit=250`

Returns a flat `DescendantPage[]`. Auto-paginates by following `_links.next`. The `depth` param controls tree depth (default 5), `limit` controls per-request page size (default/max 250).

### getSpaceTree

Returns a flat `DescendantPage[]` for the full page tree of a space up to `depth` levels (default 3, max 10).

1. Fetches root-level pages (`parentId: null`) by directly querying the pages endpoint (not via `getPages()`), auto-paginating.
2. If `depth <= 1`, returns roots only — skips descendant fetching.
3. Otherwise calls `getDescendants(rootId, { depth: depth - 1 })` for each root in parallel.
4. Merges roots (as `DescendantPage` with `depth: 0`) and all descendants into a flat array.

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
  spaceId: '67890',
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

Errors follow `fetchJsonObject` behavior (see `002-http-client.spec.md`). Additionally, `createPage` and `updatePage` throw `ZodError` if the ADF body is invalid — before any HTTP request. `deletePage` uses raw `fetch` and throws `Error` on non-ok (`response.ok === false`) responses.

## Testing

Tests in `tests/confluence/confluence-client.test.ts`. Covers: constructor (auth headers, URL building), getPage, getPages, createPage (ADF validation, representation envelope), updatePage (version fetch, ADF validation), deletePage (204 assertion), searchPages (CQL encoding, v1 response flattening), getDescendants (auto-pagination, depth/limit params), getSpaceTree (root fetch + parallel descendants, depth merging).
