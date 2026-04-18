# CredentialStorage

Credential resolution, persistence, and removal for the Atlassian Bridge CLI. Lives in `src/auth/credential-storage.ts`.

## Module Map

```
src/auth/
└── credential-storage.ts   Credential resolution — env vars + file storage (deps: shared/app-error, zod, node:fs, node:path, node:os)
```

## Overview

The `CredentialStorage` class handles credential resolution, persistence, and removal. It merges environment variables with file-based storage, throwing `AppError` when required fields are missing.

## Credentials Shape

Three fields, validated with Zod:

| Field      | Type     | Description            |
| ---------- | -------- | ---------------------- |
| `baseUrl`  | `string` | Atlassian instance URL |
| `email`    | `string` | Account email          |
| `apiToken` | `string` | API token              |

The `Credentials` type is compatible with both `ConfluenceClientConfig` and `JiraClientConfig`.

## Resolution Order

For each credential field independently, the storage takes the first value found:

1. **Environment variable** — highest priority, overrides file on a per-field basis (empty strings are treated as unset)
2. **File storage** — `~/.ab-cli/credentials.json`

If a field is missing from both sources, `load()` throws `AppError` naming the missing field.

### Environment Variables

| Variable              | Credential field |
| --------------------- | ---------------- |
| `ATLASSIAN_BASE_URL`  | `baseUrl`        |
| `ATLASSIAN_EMAIL`     | `email`          |
| `ATLASSIAN_API_TOKEN` | `apiToken`       |

### File Storage

Path: `path.join(os.homedir(), '.ab-cli', 'credentials.json')` — JSON object matching the `Credentials` shape.

A partial or malformed credentials file is an error — if the file exists, it must contain all three fields with valid types. `readFile()` throws `AppError` on malformed JSON, missing fields, or wrong types.

## Class API

```ts
export class CredentialStorage {
  constructor(configDir?: string);

  load(): Credentials;
  save(credentials: Credentials): void;
  clear(): boolean;
}
```

| Method        | Behavior                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `constructor` | Defaults `configDir` to `~/.ab-cli`. Accepts override for testing.                                              |
| `load()`      | Resolves each field from env var then file. Throws `AppError` per missing field.                                |
| `save()`      | Writes `credentials.json` to `configDir`. Creates directory if needed.                                          |
| `clear()`     | Deletes `credentials.json`. Returns `true` if removed, `false` if no file existed. Re-throws non-ENOENT errors. |

Error format: `"missing credential: <human label>"` — labels are `base URL`, `email`, `API token` (not the field names).

Internally, `readFile()` reads and validates the file against `CredentialsSchema`. Returns `Credentials` if valid, `null` on any filesystem read error (including file-not-found). Throws `AppError` if the file was read successfully but contains malformed JSON (`'invalid credentials file: malformed JSON'`) or fails schema validation (`'invalid credentials file: missing or invalid fields'`).

## Testing

Tests in `tests/auth/credential-storage.test.ts`. Uses a temp directory (via `fs.mkdtempSync`) to avoid touching `~/.ab-cli/`. Covers: load (env var priority, file fallback, per-field merging, missing field errors, malformed file errors), save (file creation, directory creation, overwrite), clear (file removal, no-file case).
