# Jira SDK

Thin client for Jira Cloud REST API v3 issue, transition, search, and project operations. Lives in `src/jira/` with Zod as the single runtime dependency. Uses `fetchJsonObject` from `src/http-client/http-client.ts` for JSON responses and raw `fetch` for void/204 responses.

## Module Map

```
src/jira/
├── jira-models.ts     Zod schemas + pagination base schemas for API responses (deps: zod)
└── jira-client.ts     JiraClient class — auth, issues, transitions, search, projects (deps: jira-models, http-client/fetchJsonObject, http-client/fetchAll, shared/adf-schema)
```

ADF schema is shared from `src/shared/adf-schema.ts` — no duplication. Jira validates ADF as an object (not a JSON string), so no `JSON.parse` step is needed.

## JiraClient

```ts
interface JiraClientConfig {
  baseUrl: string; // e.g. "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
}

export class JiraClient {
  constructor(config: JiraClientConfig);

  // Issues
  getIssue(issueIdOrKey: string): Promise<Issue>;
  createIssue(input: CreateIssueAttrs): Promise<CreatedIssue>;
  updateIssue(issueIdOrKey: string, input: UpdateIssueAttrs): Promise<Issue>;
  deleteIssue(issueIdOrKey: string): Promise<void>;

  // Transitions
  getTransitions(issueIdOrKey: string): Promise<Transition[]>;
  transitionIssue(issueIdOrKey: string, input: TransitionIssueAttrs): Promise<void>;

  // Search
  searchIssues(options: SearchIssuesOptions): Promise<IssueSearchResult>;

  // Projects
  getProject(projectKeyOrId: string): Promise<Project>;
  getProjects(options?: GetProjectsOptions): Promise<PaginatedProjects>;

  // Children
  getChildIssues(issueIdOrKey: string): Promise<Issue[]>; // auto-paginates
}
```

`deleteIssue` and `transitionIssue` return `void` — matching the Jira API's 204 No Content responses. `createIssue` returns a reference `{ id, key, self }`, not the full issue. `updateIssue` returns the full updated `Issue` — enabled by the `returnIssue=true` query parameter.

## Zod Schemas

### Pagination Base Schemas

Jira uses two distinct pagination styles. Base schemas capture the pagination metadata and are extended with `.extend()` to add the items array for each endpoint:

```ts
// Token-based pagination (used by issue search)
export const JiraTokenPaginationSchema = z.object({
  maxResults: z.number().optional(),
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional()
});

// Offset-based pagination (used by project search)
export const JiraOffsetPaginationSchema = z.object({
  startAt: z.number(),
  maxResults: z.number(),
  total: z.number()
});
```

Concrete paginated schemas are built via `.extend()` — see Issue Search Result and Paginated Projects below.

### Issue

Only the fields the CLI actually consumes. Uses `z.looseObject()` (see `000-shared.spec.md`). All fields live under a nested `fields` key (unlike Confluence where fields are top-level).

```ts
const IssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string(),
  fields: z.looseObject({
    summary: z.string(),
    status: z.looseObject({ id: z.string(), name: z.string() }),
    assignee: z.looseObject({ accountId: z.string(), displayName: z.string() }).nullable(),
    reporter: z.looseObject({ accountId: z.string(), displayName: z.string() }),
    priority: z.looseObject({ id: z.string(), name: z.string() }).optional(),
    issuetype: z.looseObject({ id: z.string(), name: z.string() }),
    project: z.looseObject({ id: z.string(), key: z.string(), name: z.string() }),
    description: z.unknown().nullable().optional(),
    created: z.string(),
    updated: z.string(),
    labels: z.array(z.string()).optional()
  })
});

type Issue = z.infer<typeof IssueSchema>;
```

### Created Issue

Slim reference returned by `POST /rest/api/3/issue`.

```ts
const CreatedIssueSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  self: z.string()
});

type CreatedIssue = z.infer<typeof CreatedIssueSchema>;
```

### Transition

```ts
const TransitionSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  to: z.looseObject({ id: z.string(), name: z.string() })
});

type Transition = z.infer<typeof TransitionSchema>;
```

### Issue Search Result

Cursor-based pagination — uses `nextPageToken` / `maxResults` / `isLast`. Built by extending `JiraTokenPaginationSchema`:

```ts
const IssueSearchResultSchema = JiraTokenPaginationSchema.extend({
  issues: z.array(IssueSchema)
});

type IssueSearchResult = z.infer<typeof IssueSearchResultSchema>;
// { issues: Issue[]; maxResults?: number; isLast?: boolean; nextPageToken?: string }
```

### Project

```ts
const ProjectSchema = z.looseObject({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projectTypeKey: z.string()
});

type Project = z.infer<typeof ProjectSchema>;
```

### Paginated Projects

Built by extending `JiraOffsetPaginationSchema`:

```ts
const PaginatedProjectsSchema = JiraOffsetPaginationSchema.extend({
  values: z.array(ProjectSchema)
});

type PaginatedProjects = z.infer<typeof PaginatedProjectsSchema>;
// { startAt: number; maxResults: number; total: number; values: Project[] }
```

## Internal State

The constructor eagerly builds auth headers (see Basic Auth in `000-shared.spec.md`) and the API URL prefix:

```ts
private readonly apiUrl: string;  // `${baseUrl}/rest/api/3`
```

Single URL prefix — all Jira v3 endpoints share `/rest/api/3` (unlike Confluence which splits across v1 and v2).

## ADF Validation

`createIssue` and `updateIssue` validate the `description` object against `AdfSchema` (see `000-shared.spec.md`) before sending any request — only when `description` is provided. Invalid ADF throws `ZodError` at the call site — no round-trip to Jira.

Unlike Confluence where `body` is a JSON **string** that requires `JSON.parse` before validation, Jira's `description` is already an ADF **object**:

```ts
if (input.description) {
  AdfSchema.parse(input.description);
}
```

The validated object is sent directly in `fields.description` — no representation envelope wrapping.

## Method Input Types

```ts
interface CreateIssueAttrs {
  projectKey: string;
  issueTypeName: string;
  summary: string;
  description?: object; // ADF document object
  parentKey?: string;
  labels?: string[];
}

interface UpdateIssueAttrs {
  summary?: string;
  description?: object; // ADF document object
  labels?: string[];
}

interface TransitionIssueAttrs {
  transitionId: string;
}

interface SearchIssuesOptions {
  jql: string;
  nextPageToken?: string; // omit for first page
  maxResults?: number; // API default: 50, API max: 5000 (not enforced client-side)
  fields?: string[]; // default: DEFAULT_ISSUE_FIELDS (summary, status, assignee, reporter, priority, issuetype, project, description, created, updated, labels)
}

interface GetProjectsOptions {
  startAt?: number; // API default: 0 (not enforced client-side)
  maxResults?: number; // API default: 50 (not enforced client-side)
  query?: string; // filter by project name
}
```

`UpdateIssueAttrs` has all fields optional — the method only includes provided fields in the request body (partial update). No version management is needed (unlike Confluence's `updatePage`).

## Implementation Details

All methods use base path `${this.apiUrl}` (which is `${baseUrl}/rest/api/3`).

### getIssue

`GET /rest/api/3/issue/{issueIdOrKey}`

### createIssue

`POST /rest/api/3/issue`

Request body sent to API:

```json
{
  "fields": {
    "project": { "key": "PROJ" },
    "issuetype": { "name": "Task" },
    "summary": "Issue title",
    "description": { "version": 1, "type": "doc", "content": [...] },
    "parent": { "key": "PROJ-10" },
    "labels": ["backend"]
  }
}
```

Validates `description` against `AdfSchema` when provided. Wraps `projectKey` as `{ key }`, `issueTypeName` as `{ name }`, `parentKey` as `{ key }`. Only includes `parent`, `description`, and `labels` when provided. Returns `CreatedIssue` (`{ id, key, self }`).

### updateIssue

`PUT /rest/api/3/issue/{issueIdOrKey}?returnIssue=true`

Request body sent to API:

```json
{
  "fields": {
    "summary": "Updated title",
    "description": { "version": 1, "type": "doc", "content": [...] },
    "labels": ["frontend"]
  }
}
```

Only includes fields that are provided in `UpdateIssueAttrs` — partial update. Validates `description` against `AdfSchema` when provided. Returns the full updated `Issue` — uses `fetchJsonObject` with `IssueSchema`, enabled by the `returnIssue=true` query parameter.

### deleteIssue

`DELETE /rest/api/3/issue/{issueIdOrKey}`

Returns 204. Uses raw `fetch` with `this.headers`, then asserts `response.ok`. Same pattern as Confluence's `deletePage`.

### getTransitions

`GET /rest/api/3/issue/{issueIdOrKey}/transitions`

Fetches via `fetchJsonObject` with an internal `TransitionsResponseSchema`:

```ts
const TransitionsResponseSchema = z.object({
  transitions: z.array(TransitionSchema)
});
```

Returns `result.transitions` — callers get the unwrapped array, never see the envelope. Parallels how Confluence's `searchPages` unwraps `V1SearchResponseSchema`.

### transitionIssue

`POST /rest/api/3/issue/{issueIdOrKey}/transitions`

Request body sent to API:

```json
{
  "transition": { "id": "31" }
}
```

Returns 204. Uses raw `fetch`, asserts `response.ok`.

### searchIssues

`GET /rest/api/3/search/jql?jql=...&fields=summary,status,...&maxResults=50`

URL-encodes `jql` via `URLSearchParams`. Always sends `fields` — defaults to `DEFAULT_ISSUE_FIELDS` (the 11 fields matching `IssueSchema`), overridable via `options.fields`. Appends `nextPageToken` and `maxResults` when provided. Cursor-based pagination — pass the returned `nextPageToken` to fetch subsequent pages. JQL reference: [Advanced searching using JQL](https://support.atlassian.com/jira-software-cloud/docs/use-advanced-search-with-jira-query-language-jql/)

### getProject

`GET /rest/api/3/project/{projectIdOrKey}`

Fetches a single project by key (e.g. `"PROJ"`) or numeric ID.

### getProjects

`GET /rest/api/3/project/search?startAt=0&maxResults=50&query=...`

Offset-based pagination. Appends `query` when provided for name-based filtering. Query string is appended only when at least one parameter is set — avoid a bare trailing `?`.

### getChildIssues

`GET /rest/api/3/search/jql?jql=parent%3D{issueIdOrKey}&maxResults=100`

Auto-paginates via `fetchAll` from `http-client.ts` — the `getCursor` callback extracts `nextPageToken` and the `fetchPage` callback appends it as a query parameter. Uses `maxResults: 100` as the internal page size. Returns a flat `Issue[]`.

## Usage

```ts
import { JiraClient } from './jira/jira-client.js';

const client = new JiraClient({
  baseUrl: 'https://your-domain.atlassian.net',
  email: 'user@example.com',
  apiToken: 'your-api-token'
});

const issue = await client.getIssue('PROJ-123');
const created = await client.createIssue({
  projectKey: 'PROJ',
  issueTypeName: 'Task',
  summary: 'New task',
  description: {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Details here' }] }]
  }
});
const results = await client.searchIssues({ jql: 'project = "PROJ" AND status = "To Do"' });
```

## Error Handling

Errors follow `fetchJsonObject` behavior (see `002-http-client.spec.md`). Additionally, `createIssue` and `updateIssue` throw `ZodError` if the ADF description is invalid — before any HTTP request, only when `description` is provided. Void methods (`deleteIssue`, `transitionIssue`) use raw `fetch` and throw `HttpError` on non-ok responses — note that void methods using raw `fetch` do **not** retry on transient errors (unlike `fetchJsonObject`, which retries via `retryWithBackoff`).

## Testing

Tests in `tests/jira/jira-client.test.ts`. Uses per-test `vi.spyOn(globalThis, 'fetch')` — each test creates its own spy, no module-level `fetchMock`. Covers: `JiraTokenPaginationSchema` (full/empty fields, `.extend()` composability); `JiraOffsetPaginationSchema` (parsing, `.extend()` composability, required field rejection); constructor (auth headers, URL building), getIssue, createIssue (ADF validation, request envelope), updateIssue (partial update, ADF validation, returns updated Issue), deleteIssue (204 assertion), getTransitions (array unwrapping), transitionIssue (request envelope), searchIssues (JQL encoding, pagination params, default fields, custom fields override), getProject (fetch by key, fetch by numeric ID), getProjects (query filtering), getChildIssues (auto-pagination via `fetchAll`).
