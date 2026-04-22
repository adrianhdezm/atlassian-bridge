# CredentialStorage

Credential resolution, persistence, and removal for the Atlassian Bridge CLI. Lives in `src/auth/credential-storage.ts`.

## Module Map

```
src/auth/
├── credential-storage.ts   Credential resolution — env vars + Keychain/file storage (deps: shared/app-error, zod, node:fs, node:path, node:os, auth/keychain)
└── keychain.ts             macOS Keychain helpers via security CLI (deps: node:child_process, shared/app-error)
```

## Overview

The `CredentialStorage` class handles credential resolution, persistence, and removal. It merges environment variables with Keychain-based (macOS) or file-based (other platforms) storage, throwing `AppError` when required fields are missing.

On macOS, the API token is stored in the system Keychain for secure credential storage. The `baseUrl` and `email` fields remain in the JSON file since they are not secrets. On non-macOS platforms, all three fields are stored in the JSON file (original behavior).

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

1. **Environment variable** — highest priority, overrides all other sources on a per-field basis (empty strings are treated as unset)
2. **macOS Keychain** — for `apiToken` only, when running on macOS
3. **File storage** — `~/.atl-cli/credentials.json`

If a field is missing from all sources, `load()` throws `AppError` naming the missing field.

### Environment Variables

| Variable              | Credential field |
| --------------------- | ---------------- |
| `ATLASSIAN_BASE_URL`  | `baseUrl`        |
| `ATLASSIAN_EMAIL`     | `email`          |
| `ATLASSIAN_API_TOKEN` | `apiToken`       |

### macOS Keychain

On macOS (`process.platform === 'darwin'`), the API token is stored and retrieved via the system Keychain using the `security` CLI:

| Operation | Command                                                               |
| --------- | --------------------------------------------------------------------- |
| Save      | `security add-generic-password -U -s atl-cli -a api-token -w <token>` |
| Load      | `security find-generic-password -s atl-cli -a api-token -w`           |
| Delete    | `security delete-generic-password -s atl-cli -a api-token`            |

Service name: `atl-cli`. Account name: `api-token`. The `-U` flag on save updates the entry if it already exists.

### File Storage

Path: `path.join(os.homedir(), '.atl-cli', 'credentials.json')`.

- **macOS**: JSON object with `{ baseUrl, email }` only (token is in Keychain)
- **Non-macOS**: JSON object with `{ baseUrl, email, apiToken }`

On macOS, `readFile()` validates against `FileOnlySchema` (requires `baseUrl` and `email`; extra fields like `apiToken` are allowed via `.passthrough()` for migration). On non-macOS, `readFile()` validates against `CredentialsSchema` (requires all three fields).

A malformed credentials file is an error — `readFile()` throws `AppError` on malformed JSON, missing fields, or wrong types.

### Migration

Existing macOS users who upgrade from file-only storage will have a `credentials.json` containing all three fields. The migration path is seamless:

1. `load()` tries the Keychain first for `apiToken`; if no entry exists, it falls back to the file's `apiToken` value
2. The next `save()` (via `atl auth login`) writes the new format: token moves to Keychain, JSON file drops `apiToken`

No explicit migration command is required.

## Class API

```ts
export class CredentialStorage {
  constructor(configDir?: string);

  load(): Credentials;
  save(credentials: Credentials): void;
  clear(): boolean;
}
```

| Method        | Behavior                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor` | Defaults `configDir` to `~/.atl-cli`. Accepts override for testing.                                                                                                 |
| `load()`      | Resolves each field from env var, then Keychain (macOS, `apiToken` only), then file. Throws `AppError` per missing field.                                           |
| `save()`      | On macOS: writes `{ baseUrl, email }` to file and stores `apiToken` in Keychain. On other platforms: writes all three fields to file. Creates directory if needed.  |
| `clear()`     | Removes the credentials file and (on macOS) the Keychain entry. Returns `true` if either was removed, `false` if neither existed. Re-throws non-ENOENT file errors. |

Error format: `"missing credential: <human label>"` — labels are `base URL`, `email`, `API token` (not the field names).

Internally, `readFile()` reads and validates the file against the appropriate schema. Returns `Partial<Credentials>` if valid, `null` on any filesystem read error (including file-not-found). Throws `AppError` if the file was read successfully but contains malformed JSON (`'invalid credentials file: malformed JSON'`) or fails schema validation (`'invalid credentials file: missing or invalid fields'`).

## Keychain Module

`src/auth/keychain.ts` — pure functions wrapping the macOS `security` CLI via `execFileSync`. No class, no state.

```ts
export const KEYCHAIN_SERVICE = 'atl-cli';
export const KEYCHAIN_ACCOUNT = 'api-token';

export function isMacOS(): boolean;
export function keychainSet(service: string, account: string, password: string): void;
export function keychainGet(service: string, account: string): string | null;
export function keychainDelete(service: string, account: string): boolean;
```

| Function           | Behavior                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `isMacOS()`        | Returns `process.platform === 'darwin'`.                                                      |
| `keychainSet()`    | Adds/updates a generic password. Throws `AppError` on failure (includes stderr if available). |
| `keychainGet()`    | Retrieves a generic password. Returns trimmed stdout, or `null` on any error (not found).     |
| `keychainDelete()` | Deletes a generic password. Returns `true` on success, `false` on any error (not found).      |

Uses `execFileSync` with array arguments (no shell interpolation) to avoid command injection. Passes `{ encoding: 'utf-8' }` to get string output.

## Testing

Tests in `tests/auth/credential-storage.test.ts` and `tests/auth/keychain.test.ts`. Uses a temp directory (via `fs.mkdtempSync`) to avoid touching `~/.atl-cli/`. The keychain module is mocked in credential-storage tests via `vi.mock`.

**credential-storage tests** cover: non-macOS path (env var priority, file fallback, per-field merging, missing field errors, malformed file errors, save, clear) and macOS Keychain path (save writes file + Keychain, load reads from Keychain, load migration from file, clear removes both, env var overrides Keychain).

**keychain tests** cover: `keychainSet` (correct args, error with stderr, error without stderr), `keychainGet` (trimmed stdout, null on not-found), `keychainDelete` (success, false on not-found), `isMacOS` (platform detection), constants.
