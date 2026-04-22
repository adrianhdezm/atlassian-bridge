# Atlassian Bridge CLI

CLI wiring layer connecting the CLI framework to the Jira and Confluence SDKs. Split across two files: `src/atl-cli.ts` (program factory) and `src/main.ts` (entry point).

## Command Overview

| Namespace    | Command    | Subcommand         | Arguments          | Options                                                                            |
| ------------ | ---------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| —            | `auth`     | `login`            | —                  | `--base-url <url>`, `--email <email>`, `--token <token>`                           |
| —            | `auth`     | `status`           | —                  | —                                                                                  |
| —            | `auth`     | `logout`           | —                  | —                                                                                  |
| —            | `pkg`      | `upgrade`          | —                  | —                                                                                  |
| `confluence` | `pages`    | `get`              | `<pageIdOrTitle>`  | `--space`                                                                          |
| `confluence` | `pages`    | `create`           | `<title>`          | `--space` **(req)**, `--parent`, `--body`                                          |
| `confluence` | `pages`    | `update`           | `<pageId>`         | `--title`, `--body`, `--parent`                                                    |
| `confluence` | `pages`    | `delete`           | `<pageId>`         | —                                                                                  |
| `confluence` | `pages`    | `children`         | `<pageIdOrTitle>`  | `--space`, `--depth`                                                               |
| `confluence` | `pages`    | `search`           | `<cql>`            | `--limit`, `--cursor`                                                              |
| `confluence` | `spaces`   | `get`              | `<spaceIdOrKey>`   | —                                                                                  |
| `confluence` | `spaces`   | `tree`             | `<spaceIdOrKey>`   | `--depth`                                                                          |
| `jira`       | `issues`   | `get`              | `<issueKey>`       | —                                                                                  |
| `jira`       | `issues`   | `create`           | `<summary>`        | `--project` **(req)**, `--type` **(req)**, `--description`, `--parent`, `--labels` |
| `jira`       | `issues`   | `update`           | `<issueKey>`       | `--summary`, `--description`, `--parent`, `--labels`, `--status`                   |
| `jira`       | `issues`   | `delete`           | `<issueKey>`       | —                                                                                  |
| `jira`       | `issues`   | `search`           | `<jql>`            | `--cursor`, `--limit`, `--fields`                                                  |
| `jira`       | `issues`   | `children`         | `<issueKey>`       | —                                                                                  |
| `jira`       | `issues`   | `list-attachments` | `<issueKey>`       | —                                                                                  |
| `jira`       | `issues`   | `get-attachment`   | `<attachmentId>`   | —                                                                                  |
| `jira`       | `projects` | `get`              | `<projectKeyOrId>` | —                                                                                  |
| `jira`       | `projects` | `list`             | —                  | `--cursor`, `--limit`, `--query`                                                   |

Global option: `-v, --verbose` (available on all commands).

## Module Map

```
src/
├── main.ts      Entry point — bootstraps the program and registers the global error handler (deps: atl-cli)
└── atl-cli.ts    Program factory — namespaces, commands, actions (deps: node:child_process, node:fs, node:path, node:url, cli/program, shared/app-error, auth/credential-storage, jira/jira-client, confluence/confluence-client)
```

## Program

The program is built inside a factory function so tests can instantiate it independently:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Program } from './cli/program.js';

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };

export function buildProgram(configDir?: string): Program {
  const credentialStorage = new CredentialStorage(configDir);
  // loadCredentials() defined here — closes over credentialStorage
  const program = new Program();
  program.name('atl').description('Atlassian Bridge — Jira & Confluence from the terminal').version(version);
  // --version output: version string from package.json (no program name prefix)
  program.option('-v, --verbose', 'Enable verbose output');
  // ... register namespaces, commands, subcommands ...
  return program;
}
```

The version is read from `package.json` at module load time using `node:fs`. The path is resolved relative to the module file via `import.meta.url`, so it works from both `src/` (dev/tsx) and `dist/` (compiled) since both are one level below the project root.

The optional `configDir` is passed through to `CredentialStorage`. When omitted (production), defaults to `~/.atl-cli`. Tests pass a temp directory for isolation.

## Entry Point

`src/main.ts` is the CLI entry point (referenced by `package.json` `bin` and `dev` script). It is intentionally thin — its only responsibilities are registering the global error handler and calling `buildProgram().parse(process.argv)`:

```ts
#!/usr/bin/env node

import { buildProgram } from './atl-cli.js';

process.on('unhandledRejection', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`error: ${message}`);
  process.exit(1);
});

buildProgram().parse(process.argv);
```

This separation keeps `atl-cli.ts` side-effect-free so tests can import `buildProgram` without triggering `parse()` or the rejection handler.

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
      throw new AppError(`${err.message} — run \`atl auth login\` or set the environment variable`);
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
- **Void operations** (delete) — `console.log('Done.')`

### Output Formatting

Before serializing to JSON, data operations in the Jira and Confluence namespaces apply format functions to strip noisy API fields from responses:

- **Jira issues** — `formatIssue` (from `jira/jira-format.ts`) applied to: `get`, `update`, `search` (maps over `issues` array), `children` (maps over result array). Not applied to `create` (returns `CreatedIssue`, not `Issue`) or `transitions`.
- **Jira projects** — `formatProject` (from `jira/jira-format.ts`) applied to: `get`, `list` (maps over `values` array, preserving the pagination envelope).
- **Confluence pages** — `formatPage` (from `confluence/confluence-format.ts`) applied to: `get`, `create`, `update`.
- **Confluence spaces** — `formatSpace` (from `confluence/confluence-format.ts`) applied to: `get`. Not applied to `tree` (returns pages, not spaces).

See `004-jira-sdk.spec.md` and `003-confluence-sdk.spec.md` for the full list of stripped keys and paths.

## Async Error Handling

Most actions are async (SDK calls return promises). Auth actions (`login`, `status`, `logout`) are synchronous since credential storage is file/Keychain-based. The framework fires actions with `void action(...)` (fire-and-forget), so `main.ts` registers a global `unhandledRejection` handler before calling `parse()`. This handler catches HTTP errors, Zod validation errors, and missing env var errors uniformly. Because it lives in `main.ts`, it never runs when tests import `buildProgram` from `atl-cli.ts`.

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

Save credentials. On macOS, stores the API token in the system Keychain and writes `baseUrl`/`email` to `~/.atl-cli/credentials.json`. On other platforms, writes all three fields to the JSON file.

```
atl auth login --base-url <url> --email <email> --token <token>
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
atl auth status
```

Loads via `loadCredentials()`. Prints base URL, email, and a masked token (last 4 characters visible, prefixed with `****`). If the token is 4 characters or shorter, display `****` only to avoid revealing the entire value. If no credentials are found, the error includes the remediation hint.

```
Base URL:  https://x.atlassian.net
Email:     user@example.com
Token:     ****abcd
```

#### `logout`

Remove stored credentials.

```
atl auth logout
```

Calls `CredentialStorage.clear()`. On macOS, removes both the credentials file and the Keychain entry. Prints `"Credentials removed."` if either existed, `"No stored credentials found."` otherwise. Does **not** affect environment variables.

---

### `pkg` (top-level command)

```ts
const pkg = program.command('pkg').description('Manage the atl package');
```

#### `upgrade`

Update the globally installed package to the latest version.

```
atl pkg upgrade
```

First checks whether the package is outdated by running `npm outdated -g @ai-foundry/atlassian-bridge` via `execSync` with `stdio: 'ignore'`. If the command exits with code 0 (package is current), prints `"Already on the latest version (x.y.z)."` (where `x.y.z` is the installed version from `package.json`) and returns. If it exits with code 1 (package is outdated), prints `"Upgrading @ai-foundry/atlassian-bridge..."` then runs `npm update -g @ai-foundry/atlassian-bridge` via `execSync` with `stdio: 'inherit'` so npm output streams directly to the terminal.

No credentials required.

---

### `confluence pages`

```ts
const pages = confluence.command('pages').description('Manage pages');
```

#### `get <pageIdOrTitle>`

Fetch a single page by ID or title.

```
atl confluence pages get <pageIdOrTitle> [flags]
```

```ts
pages
  .subcommand('get')
  .description('Get a page by ID or title')
  .argument('<pageIdOrTitle>', 'Page ID or title')
  .option('--space <id>', 'Space ID or key (narrows title search)')
  .action(async (args, opts) => { ... });
```

If the argument is all digits, it is treated as a page ID and fetches directly via `getPage(id)`. Otherwise, it performs a CQL title search via the shared `resolvePageId` helper (also used by `children`). If `--space` is provided, the CQL is scoped: `title = "X" AND space = "KEY"`. Exactly one result is required — zero results throws an error, and multiple matches lists them so the user can refine with `--space` or use the page ID directly.

| Flag           | Description                            |
| -------------- | -------------------------------------- |
| `--space <id>` | Space ID or key (narrows title search) |

SDK: `resolvePageId(pageIdOrTitle, space)` → `getPage(pageId)`

#### `create <title>`

Create a new page.

```
atl confluence pages create <title> [flags]
```

| Flag            | Description                                   | Default                                     |
| --------------- | --------------------------------------------- | ------------------------------------------- |
| `--space <id>`  | Space ID or key (**required at action time**) | —                                           |
| `--parent <id>` | Parent page ID                                | —                                           |
| `--body <adf>`  | ADF JSON body string                          | `'{"version":1,"type":"doc","content":[]}'` |

`--space` is required by the SDK. The action throws `AppError` if absent.

SDK: `createPage({ spaceIdOrKey, title, parentId, body })`

#### `update <pageId>`

Update a page's title and/or body.

```
atl confluence pages update <pageId> [flags]
```

| Flag              | Description    |
| ----------------- | -------------- |
| `--title <title>` | New title      |
| `--body <adf>`    | New ADF body   |
| `--parent <id>`   | Parent page ID |

The SDK's `UpdatePageAttrs` requires both `title` and `body`. When a flag is omitted, the action calls `getPage(pageId)` to read the current value and merges it with the provided flag. This means the page is fetched twice (once here, once inside `updatePage` for version management) — acceptable for correctness. `--parent` is optional and only sent when provided.

SDK: `updatePage(pageId, { title, body, parentId })`

#### `delete <pageId>`

Delete (trash) a page.

```
atl confluence pages delete <pageId>
```

SDK: `deletePage(pageId)` → prints `"Done."`

#### `children <pageIdOrTitle>`

Fetch child pages as a flat list. Auto-paginates internally.

```
atl confluence pages children <pageIdOrTitle> [flags]
```

If the argument is all digits, it is treated as a page ID and passed directly to `getDescendants`. Otherwise, it performs a CQL title search (same resolution as `get`). If `--space` is provided, the CQL is scoped. Exactly one result is required.

| Flag           | Description                            | Default |
| -------------- | -------------------------------------- | ------- |
| `--space <id>` | Space ID or key (narrows title search) | —       |
| `--depth <n>`  | Tree depth                             | `5`     |

SDK: `resolvePageId(pageIdOrTitle, space)` → `getDescendants(pageId, { depth, limit })`

#### `search <cql>`

Search pages via CQL.

```
atl confluence pages search <cql> [flags]
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
atl confluence spaces get <spaceIdOrKey>
```

Accepts a numeric space ID or an alphabetic space key. The SDK resolves the identifier and returns the full space object.

SDK: `getSpace(spaceIdOrKey)`

#### `tree <spaceIdOrKey>`

Fetch full space page tree as a flat list. Accepts a numeric space ID or an alphabetic space key.

```
atl confluence spaces tree <spaceIdOrKey> [flags]
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
atl jira issues get <issueKey>
```

SDK: `getIssue(issueKey)`

#### `create <summary>`

Create a new issue.

```
atl jira issues create <summary> [flags]
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
atl jira issues update <issueKey> [flags]
```

| Flag                  | Description                |
| --------------------- | -------------------------- |
| `--summary <text>`    | New summary                |
| `--description <adf>` | ADF JSON object as string  |
| `--parent <key>`      | Parent issue key           |
| `--labels <labels>`   | Comma-separated labels     |
| `--status <name>`     | Transition name to execute |

Same `--description` parse, `--labels` split, and `--parent` behavior as `create`.

##### Status transition via `--status`

When `--status` is provided, the action resolves the transition name to a transition ID and executes it **before** the field update:

1. Fetch the issue via `getIssue(issueKey)` — returns inline `transitions` array (already expanded).
2. Find the first transition whose `name` matches `--status` (case-insensitive).
3. If no match, throw `AppError` listing the available transition names.
4. Call `transitionIssue(issueKey, { transitionId })` with the resolved ID.
5. Proceed with the field update (`updateIssue`) if any other flags were provided, or call `getIssue` to fetch the post-transition state if no other flags were given.

If `--status` is the only flag, the output is the post-transition issue (via `getIssue`). If combined with other flags, the output is the result of `updateIssue` (which already returns the updated issue).

SDK: `getIssue(issueKey)` → `transitionIssue(issueKey, { transitionId })` → `updateIssue(issueKey, { summary, description, parentKey, labels })` → prints the updated issue as JSON

#### `delete <issueKey>`

Delete an issue.

```
atl jira issues delete <issueKey>
```

SDK: `deleteIssue(issueKey)` → prints `"Done."`

#### `search <jql>`

Search issues via JQL.

```
atl jira issues search <jql> [flags]
```

| Flag                | Description                 | Default |
| ------------------- | --------------------------- | ------- |
| `--cursor <cursor>` | Pagination cursor           | —       |
| `--limit <n>`       | Max results per page        | `50`    |
| `--fields <fields>` | Comma-separated field names | —       |

`--fields` is split on commas when provided.

SDK: `searchIssues({ jql, nextPageToken: cursor, maxResults: limit, fields })`

#### `children <issueKey>`

Fetch all child issues. Auto-paginates internally.

```
atl jira issues children <issueKey>
```

SDK: `getChildIssues(issueKey)`

#### `list-attachments <issueKey>`

List attachment metadata for an issue.

```
atl jira issues list-attachments <issueKey>
```

Returns an array of `{ id, filename, mimeType, size }` objects. Strips `created`, `self`, and the `content` URL from the raw attachment data to keep output concise.

SDK: `getIssueAttachments(issueKey)`

#### `get-attachment <attachmentId>`

Download a single attachment and return its content as base64.

```
atl jira issues get-attachment <attachmentId>
```

Fetches attachment metadata via `getAttachment(attachmentId)`, then downloads the binary content from the metadata's `content` URL via `getAttachmentContent(contentUrl)`. Base64-encodes the binary data with `Buffer.from(arrayBuffer).toString('base64')`. Outputs a single JSON object:

```json
{
  "id": "121181",
  "filename": "diagram.png",
  "mimeType": "image/png",
  "contentUrl": "data:image/png;base64,<base64-encoded string>"
}
```

SDK: `getAttachment(attachmentId)` → `getAttachmentContent(attachment.content)`

---

### `jira projects`

```ts
const projects = jira.command('projects').description('Manage projects');
```

#### `get <projectKeyOrId>`

Fetch a single project by key or ID.

```
atl jira projects get <projectKeyOrId>
```

SDK: `getProject(projectKeyOrId)`

#### `list`

List projects with optional name filter.

```
atl jira projects list [flags]
```

| Flag           | Description    | Default |
| -------------- | -------------- | ------- |
| `--cursor <n>` | Offset         | `0`     |
| `--limit <n>`  | Max results    | `50`    |
| `--query <q>`  | Filter by name | —       |

SDK: `getProjects({ startAt: cursor, maxResults: limit, query })`

## Help Output

Each level prints contextual help via `--help`. Example at the deepest level:

```
$ atl confluence pages create --help
Create a new page

USAGE
  atl confluence pages create <title> [flags]

ARGUMENTS
  <title>    Page title

FLAGS
      --space <id>         Space ID or key
      --parent <id>        Parent page ID
      --body <adf>         ADF JSON body string
  -v, --verbose            Enable verbose output
      --help               Show help
```

## Testing

Tests in `tests/atl-cli.test.ts`. CredentialStorage tests live separately (see `005-credential-storage.spec.md`).

### Strategy

`buildProgram(configDir?)` is exported as a factory function. Tests call `buildProgram(tmpDir).parse(argv, writer)` with a `vi.fn()` writer and a per-test temp directory, isolating credential storage from `~/.atl-cli`. Set env vars in `beforeEach`, restore in `afterEach`.

### Coverage

| Command path                   | Key cases                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth login`                   | Saves credentials, throws on missing flags                                                                                                                                                                      |
| `auth status`                  | Displays masked token, throws when unconfigured                                                                                                                                                                 |
| `auth logout`                  | Removes file, handles missing file                                                                                                                                                                              |
| `pkg upgrade`                  | Skips update when already on latest; calls `npm outdated` then `npm update` when outdated                                                                                                                       |
| `confluence pages get`         | Fetch by numeric ID, title search, `--space` scoping, zero/multiple match errors, credential loading + remediation hint                                                                                         |
| `confluence pages create`      | Required `--space` enforcement                                                                                                                                                                                  |
| `confluence pages update`      | Fetches current values when flags omitted                                                                                                                                                                       |
| `confluence pages delete`      | SDK delegation, "Done" output                                                                                                                                                                                   |
| `confluence pages children`    | Fetch by numeric ID, title search, `--space` scoping, zero/multiple match errors, depth option forwarding                                                                                                       |
| `confluence pages search`      | SDK delegation, option forwarding                                                                                                                                                                               |
| `confluence spaces get`        | SDK delegation, space ID or key                                                                                                                                                                                 |
| `confluence spaces tree`       | SDK delegation, depth option                                                                                                                                                                                    |
| `jira issues create`           | Required `--project`/`--type`, `JSON.parse` on description, comma-split labels                                                                                                                                  |
| `jira issues update`           | Partial update, description parse, parent key forwarding, `--status` transition resolution (name→ID via `getIssue` transitions, case-insensitive first match, `AppError` on no match, transition before update) |
| `jira issues delete`           | SDK delegation, "Done" output                                                                                                                                                                                   |
| `jira issues search`           | JQL string, pagination params, comma-split fields                                                                                                                                                               |
| `jira issues children`         | Auto-pagination delegation                                                                                                                                                                                      |
| `jira issues list-attachments` | SDK delegation, output contains only `{ id, filename, mimeType, size }`, empty array when no attachments                                                                                                        |
| `jira issues get-attachment`   | SDK delegation, output contains base64-encoded content                                                                                                                                                          |
| `jira projects get`            | SDK delegation, project key or ID                                                                                                                                                                               |
| `jira projects list`           | Default options, query filter                                                                                                                                                                                   |
