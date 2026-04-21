# Atlassian Bridge

A CLI for managing Jira and Confluence from the terminal. Hand-rolled command framework with Zod as the only runtime dependency.

## Prerequisites

- Node.js >= 22.12
- pnpm

## Setup

```sh
pnpm install
```

## Authentication

Credentials can be stored locally or provided via environment variables.

### Login

```sh
# Dev mode
pnpm dev auth login --base-url https://yoursite.atlassian.net --email you@example.com --token YOUR_TOKEN

# Built binary
atl auth login --base-url https://yoursite.atlassian.net --email you@example.com --token YOUR_TOKEN
```

### Environment variables

| Variable              | Description                                                                             |
| --------------------- | --------------------------------------------------------------------------------------- |
| `ATLASSIAN_BASE_URL`  | Atlassian instance URL                                                                  |
| `ATLASSIAN_EMAIL`     | Account email                                                                           |
| `ATLASSIAN_API_TOKEN` | API token ([generate one](https://id.atlassian.com/manage-profile/security/api-tokens)) |

### Other auth commands

```sh
atl auth status    # Show current credentials
atl auth logout    # Remove stored credentials
```

## Usage

In dev mode, run with `pnpm dev`; after building, use the `atl` binary directly.

```sh
# Jira
pnpm dev jira issues search "project = PROJ"
pnpm dev jira issues get PROJ-123
pnpm dev jira issues create "Fix login bug" --project PROJ --type Bug
pnpm dev jira projects list

# Confluence
pnpm dev confluence pages search "space = DEV"
pnpm dev confluence pages get "My Page Title" --space DEV
pnpm dev confluence pages children 12345
pnpm dev confluence spaces tree SPACEKEY
```

## Commands

```
atl auth login|status|logout

atl jira issues get <issueKey>
atl jira issues create <summary> --project <key> --type <name> [--description <adf>] [--parent <key>] [--labels <csv>]
atl jira issues update <issueKey> [--summary] [--description] [--parent] [--labels] [--status]
atl jira issues delete <issueKey>
atl jira issues search <jql> [--limit] [--cursor] [--fields]
atl jira issues children <issueKey>

atl jira projects get <keyOrId>
atl jira projects list [--limit] [--cursor] [--query]

atl confluence pages get <idOrTitle> [--space]
atl confluence pages create <title> --space <id> [--parent <id>] [--body <adf>]
atl confluence pages update <pageId> [--title] [--body] [--parent]
atl confluence pages delete <pageId>
atl confluence pages search <cql> [--limit] [--cursor]
atl confluence pages children <idOrTitle> [--space] [--depth]

atl confluence spaces get <idOrKey>
atl confluence spaces tree <idOrKey> [--depth]
```

Global flags: `--help`, `--version`, `-v/--verbose`

## Development

```sh
pnpm dev       # Run CLI in dev mode (tsx)
pnpm build     # Compile TypeScript to dist/
pnpm test      # Run all tests
pnpm lint      # Lint with ESLint
pnpm format    # Format with Prettier
```

## License

MIT
