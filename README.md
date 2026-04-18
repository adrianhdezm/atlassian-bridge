# Atlassian Bridge

A CLI for managing Jira and Confluence from the command line.

## Prerequisites

- Node.js >= 22.12
- pnpm

## Installation

```sh
pnpm install
```

## Usage

```sh
# Run in dev mode
pnpm dev -- <command>

# Examples
pnpm dev -- jira issues search "project = PROJ"
pnpm dev -- confluence pages list --space SPACE_KEY
pnpm dev -- auth login --base-url https://yoursite.atlassian.net --email you@example.com --token YOUR_TOKEN
```

## Configuration

Credentials can be provided via `ab auth login` or environment variables:

- `ATLASSIAN_BASE_URL` — your Atlassian instance URL
- `ATLASSIAN_EMAIL` — account email
- `ATLASSIAN_API_TOKEN` — API token (generate one at [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens))

## Development

```sh
pnpm build    # Compile TypeScript to dist/
pnpm test     # Run all tests
pnpm lint     # Lint with ESLint
pnpm format   # Format with Prettier
```

## License

MIT
