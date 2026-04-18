# Atlassian Bridge CLI

Entry point wiring the CLI framework to the Jira and Confluence SDKs. Single file at `src/ab-cli.ts`.

## Command Overview

| Namespace    | Command    | Subcommand    | Arguments                     | Options                                                                            |
| ------------ | ---------- | ------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| —            | `auth`     | `login`       | —                             | `--base-url <url>`, `--email <email>`, `--token <token>`                           |
| —            | `auth`     | `status`      | —                             | —                                                                                  |
| —            | `auth`     | `logout`      | —                             | —                                                                                  |
| `confluence` | `pages`    | `get`         | `<pageId>`                    | —                                                                                  |
| `confluence` | `pages`    | `list`        | —                             | `--space`, `--title`, `--status`, `--limit`, `--cursor`                            |
| `confluence` | `pages`    | `create`      | `<title>`                     | `--space` **(req)**, `--parent-id`, `--body`                                       |
| `confluence` | `pages`    | `update`      | `<pageId>`                    | `--title`, `--body`                                                                |
| `confluence` | `pages`    | `delete`      | `<pageId>`                    | —                                                                                  |
| `confluence` | `pages`    | `descendants` | `<pageId>`                    | `--depth`, `--limit`                                                               |
| `confluence` | `pages`    | `search`      | `<cql>`                       | `--limit`, `--cursor`                                                              |
| `confluence` | `spaces`   | `get`         | `<spaceIdOrKey>`              | —                                                                                  |
| `confluence` | `spaces`   | `tree`        | `<spaceIdOrKey>`              | `--depth`                                                                          |
| `jira`       | `issues`   | `get`         | `<issueKey>`                  | —                                                                                  |
| `jira`       | `issues`   | `create`      | `<summary>`                   | `--project` **(req)**, `--type` **(req)**, `--description`, `--parent`, `--labels` |
| `jira`       | `issues`   | `update`      | `<issueKey>`                  | `--summary`, `--description`, `--labels`                                           |
| `jira`       | `issues`   | `delete`      | `<issueKey>`                  | —                                                                                  |
| `jira`       | `issues`   | `transitions` | `<issueKey>`                  | —                                                                                  |
| `jira`       | `issues`   | `transition`  | `<issueKey>` `<transitionId>` | —                                                                                  |
| `jira`       | `issues`   | `search`      | `<jql>`                       | `--next-page-token`, `--max-results`, `--fields`                                   |
| `jira`       | `issues`   | `children`    | `<issueKey>`                  | —                                                                                  |
| `jira`       | `projects` | `get`         | `<projectKeyOrId>`            | —                                                                                  |
| `jira`       | `projects` | `list`        | —                             | `--start-at`, `--max-results`, `--query`                                           |

Global option: `-v, --verbose` (available on all commands).

## Module Map

```
src/
└── ab-cli.ts    CLI entry — program, namespaces, commands, actions (deps: cli/program, shared/app-error, auth/credential-storage, jira/jira-client, confluence/confluence-client)
```

## Program

The program is built inside a factory function so tests can instantiate it independently:

```ts
import { Program } from './cli/program.js';

export function buildProgram(configDir?: string): Program {
  const credentialStorage = new CredentialStorage(configDir);
  // loadCredentials() defined here — closes over credentialStorage
  const program = new Program();
  program.name('ab').description('Atlassian Bridge — Jira & Confluence from the terminal').version('0.1.0');
  // --version output: "0.1.0" (version string only, no program name prefix)
  program.option('-v, --verbose', 'Enable verbose output');
  // ... register namespaces, commands, subcommands ...
  return program;
}
```

The optional `configDir` is passed through to `CredentialStorage`. When omitted (production), defaults to `~/.ab-cli`. Tests pass a temp directory for isolation.

When run as the entry point, an `isMainModule` guard calls `buildProgram().parse(process.argv)` and registers the global error handler. This guard prevents `parse()` and the rejection handler from running during imports (e.g. in tests).

## Authentication

See [005-credential-storage.spec.md](005-credential-storage.spec.md) for the full `CredentialStorage` spec (env vars, file storage, Zod schema, class API).

A `CredentialStorage` instance is constructed inside `buildProgram` and shared across all actions within that program instance:

```ts
const credentialStorage = new CredentialStorage(configDir);
```

Actions call `loadCredentials()` — a thin wrapper that catches credential errors from `credentialStorage.load()` and re-throws with a remediation hint:

```ts
function loadCredentials(): Credentials {
  try {
    return credentialStorage.load();
  } catch (err) {
    if (err instanceof AppError) {
      throw new AppError(`${err.message} — run \`ab auth login\` or set the environment variable`);
    }
    throw err;
  }
}
```

Credentials are resolved lazily per invocation, so help and `--version` work without credentials. Example usage in an action:

```ts
const creds = loadCredentials();
const client = new ConfluenceClient(creds); // or JiraClient(creds)
```

## Output

Actions print results to stdout via `console.log`:

- **Data operations** — `console.log(JSON.stringify(result, null, 2))`
- **Void operations** (delete, transition, Jira update) — `console.log('Done.')`

## Async Error Handling

Most actions are async (SDK calls return promises). Auth actions (`login`, `status`, `logout`) are synchronous since credential storage is file-based. The framework fires actions with `void action(...)` (fire-and-forget), so the entry point registers a global handler inside the `isMainModule` guard:

```ts
process.on('unhandledRejection', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
});
```

This only runs when `ab-cli.ts` is the entry point — not when imported by tests. It catches HTTP errors, Zod validation errors, and missing env var errors uniformly.

## Namespaces

```ts
const confluence = program.namespace('confluence').description('Confluence operations');
const jira = program.namespace('jira').description('Jira operations');
```

## Commands & Subcommands

Option values arrive as strings from the parser. Actions convert numeric options with `Number()` before passing to SDK methods. Comma-separated list options (e.g. `--labels`) are split with `.split(',')`.

### `auth` (top-level command)

```ts
const auth = program.command('auth').description('Manage authentication');
```

#### `login`

Save credentials to `~/.ab-cli/credentials.json`.

```
ab auth login --base-url <url> --email <email> --token <token>
```

| Flag               | Description            |
| ------------------ | ---------------------- |
| `--base-url <url>` | Atlassian instance URL |
| `--email <email>`  | Account email          |
| `--token <token>`  | API token              |

All three flags required — the action throws `AppError` if any is absent. On success, prints `"Credentials saved."`.

#### `status`

Show current credential source and values.

```
ab auth status
```

Loads via `loadCredentials()`. Prints base URL, email, and a masked token (last 4 characters visible, prefixed with `****`). If the token is 4 characters or shorter, display `****` only to avoid revealing the entire value. If no credentials are found, the error includes the remediation hint.

```
Base URL:  https://x.atlassian.net
Email:     user@example.com
Token:     ****abcd
```

#### `logout`

Remove stored credentials file.

```
ab auth logout
```

Calls `CredentialStorage.clear()`. Prints `"Credentials removed."` if the file existed, `"No stored credentials found."` otherwise. Does **not** affect environment variables.

---

### `confluence pages`

```ts
const pages = confluence.command('pages').description('Manage pages');
```

#### `get <pageId>`

Fetch a single page by ID.

```
ab confluence pages get <pageId>
```

```ts
pages
  .subcommand('get')
  .description('Get a page by ID')
  .argument('<pageId>', 'Page ID')
  .action(async (args) => {
    const creds = loadCredentials();
    const client = new ConfluenceClient(creds);
    const page = await client.getPage(args['pageId'] as string);
    console.log(JSON.stringify(page, null, 2));
  });
```

SDK: `getPage(pageId)`

#### `list`

List pages with optional filters.

```
ab confluence pages list [flags]
```

| Flag                | Description               | Default |
| ------------------- | ------------------------- | ------- |
| `--space <id>`      | Filter by space ID or key | —       |
| `--title <title>`   | Filter by title           | —       |
| `--status <status>` | Filter by status          | —       |
| `--limit <n>`       | Max results               | `25`    |
| `--cursor <cursor>` | Pagination cursor         | —       |

SDK: `getPages({ spaceIdOrKey, title, status, limit, cursor })`

#### `create <title>`

Create a new page.

```
ab confluence pages create <title> [flags]
```

| Flag               | Description                                   | Default                                     |
| ------------------ | --------------------------------------------- | ------------------------------------------- |
| `--space <id>`     | Space ID or key (**required at action time**) | —                                           |
| `--parent-id <id>` | Parent page ID                                | —                                           |
| `--body <adf>`     | ADF JSON body string                          | `'{"version":1,"type":"doc","content":[]}'` |

`--space` is required by the SDK. The action throws `AppError` if absent.

SDK: `createPage({ spaceIdOrKey, title, parentId, body })`

#### `update <pageId>`

Update a page's title and/or body.

```
ab confluence pages update <pageId> [flags]
```

| Flag              | Description  |
| ----------------- | ------------ |
| `--title <title>` | New title    |
| `--body <adf>`    | New ADF body |

The SDK's `UpdatePageAttrs` requires both `title` and `body`. When a flag is omitted, the action calls `getPage(pageId)` to read the current value and merges it with the provided flag. This means the page is fetched twice (once here, once inside `updatePage` for version management) — acceptable for correctness.

SDK: `updatePage(pageId, { title, body })`

#### `delete <pageId>`

Delete (trash) a page.

```
ab confluence pages delete <pageId>
```

SDK: `deletePage(pageId)` → prints `"Done."`

#### `descendants <pageId>`

Fetch descendants as a flat list. Auto-paginates internally.

```
ab confluence pages descendants <pageId> [flags]
```

| Flag          | Description          | Default |
| ------------- | -------------------- | ------- |
| `--depth <n>` | Tree depth           | `5`     |
| `--limit <n>` | Per-page fetch limit | `250`   |

SDK: `getDescendants(pageId, { depth, limit })`

#### `search <cql>`

Search pages via CQL.

```
ab confluence pages search <cql> [flags]
```

| Flag                | Description       | Default |
| ------------------- | ----------------- | ------- |
| `--limit <n>`       | Max results       | `25`    |
| `--cursor <cursor>` | Pagination cursor | —       |

SDK: `searchPages({ cql, limit, cursor })`

---

### `confluence spaces`

```ts
const spaces = confluence.command('spaces').description('Manage spaces');
```

#### `get <spaceIdOrKey>`

Fetch a single space by ID or key.

```
ab confluence spaces get <spaceIdOrKey>
```

Accepts a numeric space ID or an alphabetic space key. The SDK resolves the identifier and returns the full space object.

SDK: `getSpace(spaceIdOrKey)`

#### `tree <spaceIdOrKey>`

Fetch full space page tree as a flat list. Accepts a numeric space ID or an alphabetic space key.

```
ab confluence spaces tree <spaceIdOrKey> [flags]
```

| Flag          | Description      | Default |
| ------------- | ---------------- | ------- |
| `--depth <n>` | Descendant depth | `2`     |

SDK: `getSpaceTree(spaceIdOrKey, { depth })`

---

### `jira issues`

```ts
const issues = jira.command('issues').description('Manage issues');
```

#### `get <issueKey>`

Fetch a single issue by key or ID.

```
ab jira issues get <issueKey>
```

SDK: `getIssue(issueKey)`

#### `create <summary>`

Create a new issue.

```
ab jira issues create <summary> [flags]
```

| Flag                  | Description                                   | Default |
| --------------------- | --------------------------------------------- | ------- |
| `--project <key>`     | Project key (**required at action time**)     | —       |
| `--type <name>`       | Issue type name (**required at action time**) | —       |
| `--description <adf>` | ADF JSON object as string                     | —       |
| `--parent <key>`      | Parent issue key                              | —       |
| `--labels <labels>`   | Comma-separated labels                        | —       |

`--project` and `--type` are required by the SDK. The action throws `AppError` if absent.

`--description` is a JSON string. The action `JSON.parse`s it into an object before passing to the SDK (Jira takes ADF as an object, not a string).

`--labels` is split on commas: `"backend,frontend"` → `["backend", "frontend"]`.

SDK: `createIssue({ projectKey, issueTypeName, summary, description, parentKey, labels })`

#### `update <issueKey>`

Update an issue. All flags optional — only provided fields are sent (partial update).

```
ab jira issues update <issueKey> [flags]
```

| Flag                  | Description               |
| --------------------- | ------------------------- |
| `--summary <text>`    | New summary               |
| `--description <adf>` | ADF JSON object as string |
| `--labels <labels>`   | Comma-separated labels    |

Same `--description` parse and `--labels` split behavior as `create`.

SDK: `updateIssue(issueKey, { summary, description, labels })` → prints `"Done."`

#### `delete <issueKey>`

Delete an issue.

```
ab jira issues delete <issueKey>
```

SDK: `deleteIssue(issueKey)` → prints `"Done."`

#### `transitions <issueKey>`

List available transitions for an issue.

```
ab jira issues transitions <issueKey>
```

SDK: `getTransitions(issueKey)`

#### `transition <issueKey> <transitionId>`

Execute a workflow transition.

```
ab jira issues transition <issueKey> <transitionId>
```

SDK: `transitionIssue(issueKey, { transitionId })` → prints `"Done."`

#### `search <jql>`

Search issues via JQL.

```
ab jira issues search <jql> [flags]
```

| Flag                        | Description                 | Default |
| --------------------------- | --------------------------- | ------- |
| `--next-page-token <token>` | Cursor token for next page  | —       |
| `--max-results <n>`         | Max results per page        | `50`    |
| `--fields <fields>`         | Comma-separated field names | —       |

`--fields` is split on commas when provided.

SDK: `searchIssues({ jql, nextPageToken, maxResults, fields })`

#### `children <issueKey>`

Fetch all child issues. Auto-paginates internally.

```
ab jira issues children <issueKey>
```

SDK: `getChildIssues(issueKey)`

---

### `jira projects`

```ts
const projects = jira.command('projects').description('Manage projects');
```

#### `get <projectKeyOrId>`

Fetch a single project by key or ID.

```
ab jira projects get <projectKeyOrId>
```

SDK: `getProject(projectKeyOrId)`

#### `list`

List projects with optional name filter.

```
ab jira projects list [flags]
```

| Flag                | Description    | Default |
| ------------------- | -------------- | ------- |
| `--start-at <n>`    | Offset         | `0`     |
| `--max-results <n>` | Max results    | `50`    |
| `--query <q>`       | Filter by name | —       |

SDK: `getProjects({ startAt, maxResults, query })`

## Help Output

Each level prints contextual help via `--help`. Example at the deepest level:

```
$ ab confluence pages create --help
Create a new page

USAGE
  ab confluence pages create <title> [flags]

ARGUMENTS
  <title>    Page title

FLAGS
      --space <id>         Space ID or key
      --parent-id <id>     Parent page ID
      --body <adf>         ADF JSON body string
  -v, --verbose            Enable verbose output
      --help               Show help
```

## Testing

Tests in `tests/ab-cli.test.ts`. CredentialStorage tests live separately (see `005-credential-storage.spec.md`).

### Strategy

`buildProgram(configDir?)` is exported as a factory function. Tests call `buildProgram(tmpDir).parse(argv, writer)` with a `vi.fn()` writer and a per-test temp directory, isolating credential storage from `~/.ab-cli`. Set env vars in `beforeEach`, restore in `afterEach`.

### Coverage

| Command path                                 | Key cases                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `auth login`                                 | Saves credentials, throws on missing flags                                     |
| `auth status`                                | Displays masked token, throws when unconfigured                                |
| `auth logout`                                | Removes file, handles missing file                                             |
| `confluence pages get`                       | Credential loading + remediation hint, SDK delegation                          |
| `confluence pages list`                      | Default options, query param forwarding                                        |
| `confluence pages create`                    | Required `--space` enforcement                                                 |
| `confluence pages update`                    | Fetches current values when flags omitted                                      |
| `confluence pages delete/descendants/search` | SDK delegation, option forwarding                                              |
| `confluence spaces get`                      | SDK delegation, space ID or key                                                |
| `confluence spaces tree`                     | SDK delegation, depth option                                                   |
| `jira issues create`                         | Required `--project`/`--type`, `JSON.parse` on description, comma-split labels |
| `jira issues update`                         | Partial update, description parse                                              |
| `jira issues delete/transitions/transition`  | SDK delegation, "Done" output                                                  |
| `jira issues search`                         | JQL string, pagination params, comma-split fields                              |
| `jira issues children`                       | Auto-pagination delegation                                                     |
| `jira projects get`                          | SDK delegation, project key or ID                                              |
| `jira projects list`                         | Default options, query filter                                                  |
